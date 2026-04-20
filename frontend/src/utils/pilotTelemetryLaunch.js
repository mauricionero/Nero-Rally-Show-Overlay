import Ably from 'ably';
import { parseChannelKey } from './websocketProvider.js';
import { getLocalPilotTelemetryUrl } from './overlayUrls.js';

const normalizeFilePart = (value, fallback = 'pilot') => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
};

const renderJsonString = (value) => JSON.stringify(value ?? {});

const buildPilotTelemetryPowerShellScript = ({
  tokenDetails,
  channelId,
  pilotId,
  pilotName,
  telemetryUrl
}) => {
  const renderedTokenDetails = renderJsonString(tokenDetails);
  const renderedLaunchConfig = renderJsonString({
    channelId,
    pilotId,
    pilotName: pilotName || pilotId || 'Pilot',
    telemetryUrl: telemetryUrl || ''
  });

  return `$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$LaunchConfig = @'
${renderedLaunchConfig}
'@ | ConvertFrom-Json

$TokenDetails = @'
${renderedTokenDetails}
'@ | ConvertFrom-Json

$Script:AblyToken = $null
$Script:AblyTokenExpiresAt = 0
$Script:HttpClient = $null
$Script:UdpPort = 20777
$Script:PublishIntervalSeconds = 1.0
$Script:ChannelName = "rally-telemetry:$($LaunchConfig.channelId)"

function Get-FloatAtIndex {
  param(
    [byte[]]$Data,
    [int]$Index
  )

  $offset = $Index * 4
  if (-not $Data -or $offset -lt 0 -or ($offset + 4) -gt $Data.Length) {
    throw "Telemetry packet is too short."
  }

  return [BitConverter]::ToSingle($Data, $offset)
}

function Format-RunTime {
  param([double]$Seconds)

  if ($Seconds -lt 0) {
    $Seconds = 0
  }

  $totalMilliseconds = [math]::Round($Seconds * 1000)
  $wholeSeconds = [int64]([math]::Floor($totalMilliseconds / 1000))
  $milliseconds = [int64]($totalMilliseconds % 1000)
  $hours = [int64]([math]::Floor($wholeSeconds / 3600))
  $minutes = [int64]([math]::Floor(($wholeSeconds % 3600) / 60))
  $seconds = [int64]($wholeSeconds % 60)

  return ("{0:00}:{1:00}:{2:00}.{3:000}" -f $hours, $minutes, $seconds, $milliseconds)
}

function Format-NormalizedLatLong {
  param(
    [double]$PosX,
    [double]$PosZ
  )

  $lat = [math]::Max(-89.9999999, [math]::Min(89.9999999, [math]::Round($PosZ / 100000.0, 7)))
  $lng = [math]::Max(-179.9999999, [math]::Min(179.9999999, [math]::Round($PosX / 100000.0, 7)))
  return ("{0:F7},{1:F7}" -f $lat, $lng)
}

function Write-Info {
  param([string]$Message)
  Write-Host $Message
}

function Initialize-AblyToken {
  if (-not $TokenDetails -or -not $TokenDetails.token) {
    throw "Launcher token missing."
  }

  $expiresAt = 0
  if ($TokenDetails.PSObject.Properties.Name -contains "expires" -and $TokenDetails.expires) {
    $expiresAt = [int64]$TokenDetails.expires
  }

  if ($expiresAt -gt 0) {
    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($expiresAt -le $nowMs) {
      throw "Launcher token expired. Generate a new launcher from the pilot telemetry page."
    }
    $Script:AblyTokenExpiresAt = $expiresAt
  }

  $Script:AblyToken = [string]$TokenDetails.token
}

function Initialize-HttpClient {
  if ($Script:HttpClient) {
    return
  }

  $client = New-Object System.Net.Http.HttpClient
  $client.DefaultRequestHeaders.ConnectionClose = $false
  $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Script:AblyToken)
  $client.Timeout = [TimeSpan]::FromSeconds(15)
  $Script:HttpClient = $client
}

function Ensure-GameTelemetryEnabled {
  $paths = @(
    [System.IO.Path]::Combine([Environment]::GetFolderPath("MyDocuments"), "My Games", "DiRT Rally 2.0", "hardwaresettings", "hardware_settings_config.xml"),
    [System.IO.Path]::Combine($env:USERPROFILE, "OneDrive", "Documents", "My Games", "DiRT Rally 2.0", "hardwaresettings", "hardware_settings_config.xml")
  )

  foreach ($path in $paths) {
    if (-not (Test-Path $path)) {
      continue
    }

    try {
      [xml]$config = Get-Content -Path $path -Raw
      $udpNode = $config.SelectSingleNode("//udp")

      if (-not $udpNode) {
        $udpNode = $config.CreateElement("udp")
        [void]$config.DocumentElement.AppendChild($udpNode)
      }

      $udpNode.SetAttribute("enabled", "true")
      $udpNode.SetAttribute("ip", "127.0.0.1")
      $udpNode.SetAttribute("port", [string]$Script:UdpPort)
      if (-not $udpNode.GetAttribute("delay")) {
        $udpNode.SetAttribute("delay", "1")
      }

      $config.Save($path)
      Write-Info "UDP telemetry enabled in Dirt Rally 2.0. Restart the game if it was already open."
      return $true
    } catch {
      Write-Info "Could not update Dirt Rally 2.0 config: $($_.Exception.Message)"
      return $false
    }
  }

  Write-Info "Dirt Rally 2.0 configuration file was not found. Telemetry will work only if UDP is already enabled."
  return $false
}

function Read-TelemetryPacket {
  param([byte[]]$Data)

  if (-not $Data -or $Data.Length -lt 260) {
    return $null
  }

  try {
    $runTime = [double](Get-FloatAtIndex -Data $Data -Index 0)
    $lapTime = [double](Get-FloatAtIndex -Data $Data -Index 1)
    $distanceDrivenLap = [double](Get-FloatAtIndex -Data $Data -Index 2)
    $distanceDrivenOverall = [double](Get-FloatAtIndex -Data $Data -Index 3)
    $posX = [double](Get-FloatAtIndex -Data $Data -Index 4)
    $posY = [double](Get-FloatAtIndex -Data $Data -Index 5)
    $posZ = [double](Get-FloatAtIndex -Data $Data -Index 6)
    $speedMs = [double](Get-FloatAtIndex -Data $Data -Index 7)
    $yaw = [double](Get-FloatAtIndex -Data $Data -Index 16)
    $gear = [int]([math]::Round((Get-FloatAtIndex -Data $Data -Index 33)))
    $gForceLat = [double](Get-FloatAtIndex -Data $Data -Index 34)
    $gForceLon = [double](Get-FloatAtIndex -Data $Data -Index 35)
    $rpmReal = [double](Get-FloatAtIndex -Data $Data -Index 37)
  } catch {
    return $null
  }

  $speedKmh = [math]::Round($speedMs * 3.6, 1)
  $headingDeg = [math]::Round((($yaw * 180.0) / [math]::PI) % 360.0, 1)
  if ($headingDeg -lt 0) {
    $headingDeg += 360.0
  }

  $gForce = [math]::Round([math]::Sqrt(($gForceLat * $gForceLat) + ($gForceLon * $gForceLon)), 2)
  $rpmPercentage = $null
  $maxRpm = 8000.0
  if ($maxRpm -gt 0) {
    $rpmPercentage = [math]::Round(($rpmReal / $maxRpm) * 100.0, 1)
  }

  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  $packet = [pscustomobject]@{
    messageType = "pilot-telemetry"
    pilotId = $LaunchConfig.pilotId
    source = "dirt-rally-2"
    latLong = (Format-NormalizedLatLong -PosX $posX -PosZ $posZ)
    distance = [math]::Round($distanceDrivenOverall, 3)
    distanceDrivenLap = [math]::Round($distanceDrivenLap, 3)
    distanceDrivenOverall = [math]::Round($distanceDrivenOverall, 3)
    speed = $speedKmh
    heading = $headingDeg
    gForce = $gForce
    longitudinalG = [math]::Round($gForceLon, 2)
    lateralG = [math]::Round($gForceLat, 2)
    rpmReal = [math]::Round($rpmReal, 1)
    rpmPercentage = $rpmPercentage
    gear = $gear
    posX = [math]::Round($posX, 3)
    posY = [math]::Round($posY, 3)
    posZ = [math]::Round($posZ, 3)
    lastTelemetryAt = $nowMs
    latlongTimestamp = $nowMs
  }

  return $packet
}

function Publish-TelemetryPacket {
  param([object]$Packet)

  if (-not $Script:AblyToken) {
    Initialize-AblyToken
  }

  if (-not $Script:HttpClient) {
    Initialize-HttpClient
  }

  $uri = "https://main.realtime.ably.net/channels/$($Script:ChannelName)/messages"
  $body = @{ name = "update"; data = $Packet } | ConvertTo-Json -Depth 20 -Compress
  $content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, "application/json")

  try {
    $response = $Script:HttpClient.PostAsync($uri, $content).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      $statusCode = [int]$response.StatusCode
      $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

      if ($statusCode -eq 401 -or $statusCode -eq 403) {
        throw "Ably token rejected or expired. Generate a new launcher from the pilot telemetry page."
      }

      throw "Publish failed with status $statusCode: $responseBody"
    }

    $response.Dispose()
    return $true
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -eq 401 -or $statusCode -eq 403) {
      throw "Ably token rejected or expired. Generate a new launcher from the pilot telemetry page."
    }

    throw
  }
}

function Main {
  Write-Info ("Pilot: {0} ({1})" -f $LaunchConfig.pilotName, $LaunchConfig.pilotId)
  Write-Info ("Ably channel: {0}" -f $Script:ChannelName)
  if ($LaunchConfig.telemetryUrl) {
    Write-Info ("Telemetry page: {0}" -f $LaunchConfig.telemetryUrl)
  }

  [void](Ensure-GameTelemetryEnabled)

  $udpClient = New-Object System.Net.Sockets.UdpClient($Script:UdpPort)
  $udpClient.Client.ReceiveTimeout = 1000
  $remoteEndpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)

  Write-Info ("Listening for Dirt Rally 2 telemetry on UDP {0}..." -f $Script:UdpPort)
  $lastPublishAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $lastStatusLine = ""

  while ($true) {
    $data = $null
    try {
      $data = $udpClient.Receive([ref]$remoteEndpoint)
    } catch [System.Net.Sockets.SocketException] {
      if ($_.Exception.SocketErrorCode -ne [System.Net.Sockets.SocketError]::TimedOut) {
        throw
      }
    }

    if (-not $data) {
      continue
    }

    $packet = Read-TelemetryPacket -Data $data
    if (-not $packet) {
      continue
    }

    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (($nowMs - $lastPublishAt) -lt ($Script:PublishIntervalSeconds * 1000)) {
      continue
    }

    if (-not (Publish-TelemetryPacket -Packet $packet)) {
      Start-Sleep -Seconds 1
      continue
    }

    $lastPublishAt = $nowMs
    $statusLine = ([char]13) + ("Speed: {0,6:N1} km/h | G: {1,4:N2} | Heading: {2,6:N1}°" -f [double]$packet.speed, [double]$packet.gForce, [double]$packet.heading)
    if ($statusLine -ne $lastStatusLine) {
      Write-Host -NoNewline $statusLine
      $lastStatusLine = $statusLine
    }
  }
}

try {
  Main
} catch {
  Write-Host ""
  Write-Host ("Launcher stopped: {0}" -f $_.Exception.Message)
  exit 1
}
`;
};

const buildPilotTelemetryBatScript = ({
  tokenDetails,
  channelId,
  pilotId,
  pilotName,
  telemetryUrl
}) => {
  const renderedPowerShellContent = String(
    buildPilotTelemetryPowerShellScript({
      tokenDetails,
      channelId,
      pilotId,
      pilotName,
      telemetryUrl
    }) || ''
  )
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const preambleLines = [
    '@echo off',
    'setlocal EnableExtensions',
    'set "PS_EXE="',
    'where powershell >nul 2>nul && set "PS_EXE=powershell"',
    'if not defined PS_EXE where pwsh >nul 2>nul && set "PS_EXE=pwsh"',
    'if not defined PS_EXE (',
    '  echo PowerShell is required but was not found in PATH.',
    '  pause',
    '  exit /b 1',
    ')',
    'set "TEMP_PS1=%TEMP%\\rally_pilot_telemetry_%RANDOM%%RANDOM%.ps1"',
    'more +12 "%~f0" > "%TEMP_PS1%"',
    'if errorlevel 1 (',
    '  echo Failed to unpack telemetry launcher.',
    '  pause',
    '  exit /b 1',
    ')',
    '"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%TEMP_PS1%"',
    'set "EXIT_CODE=%ERRORLEVEL%"',
    'del "%TEMP_PS1%" >nul 2>nul',
    'pause',
    'exit /b %EXIT_CODE%',
    '',
    '__POWERSHELL_PAYLOAD__'
  ];
  const payloadStartLine = preambleLines.length;
  const extractorLineIndex = preambleLines.findIndex((line) => String(line || '').startsWith('more +'));
  if (extractorLineIndex >= 0) {
    preambleLines[extractorLineIndex] = `more +${payloadStartLine} "%~f0" > "%TEMP_PS1%"`;
  }

  return `${preambleLines.join('\r\n')}\r\n${renderedPowerShellContent}\r\n`;
};

export const requestPilotTelemetryLaunchToken = async ({ channelId, pilotId } = {}) => {
  const cleanChannelId = String(channelId || '').trim();
  const cleanPilotId = String(pilotId || '').trim();
  const apiKey = process.env.REACT_APP_ABLY_KEY;

  if (!cleanChannelId || !cleanPilotId) {
    throw new Error('Missing channel or pilot ID for launcher token request');
  }

  if (!apiKey) {
    throw new Error('Ably API key is not configured in the frontend environment');
  }

  const capability = {
    [`rally-telemetry:${cleanChannelId}`]: ['publish']
  };
  const rest = new Ably.Rest(apiKey);

  return rest.auth.requestToken({
    ttl: 12 * 60 * 60 * 1000,
    capability,
    clientId: cleanPilotId
  });
};

export const buildPilotTelemetryLaunchArtifacts = ({
  channelKey,
  pilot,
  telemetryUrl
} = {}) => {
  const { valid, channelId } = parseChannelKey(channelKey);
  const pilotId = String(pilot?.id || '').trim();

  if (!valid || !channelId || !pilotId) {
    return null;
  }

  const pilotName = String(pilot?.name || pilotId || 'Pilot').trim();
  const safePilotName = normalizeFilePart(pilotName, 'pilot');
  const safePilotId = normalizeFilePart(pilotId, 'pilot');
  const baseName = `pilot-telemetry-${safePilotName}-${safePilotId}`;
  const batFileName = `run-${baseName}.bat`;

  return {
    channelId,
    pilotId,
    pilotName,
    batFileName,
    telemetryUrl: telemetryUrl || ''
  };
};

export const getPilotTelemetryLaunchPageUrl = (channelKey, pilotId = '') => {
  const url = new URL(getLocalPilotTelemetryUrl());

  if (channelKey) {
    url.searchParams.set('ws', channelKey);
  }

  if (pilotId) {
    url.searchParams.set('pilotId', pilotId);
  }

  return url.toString();
};

export const downloadTextFile = (filename, content) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export {
  buildPilotTelemetryBatScript
};

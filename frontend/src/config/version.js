// Application version
// Update this value whenever you release a new version of the overlay software.
// This file is imported by both the Setup and Overlay pages to display the
// version number in the UI.

export const VERSION = '1.11.1';
export const APK_VERSION = '1.2';
export const APK_FILE_NAME = `nrs-control-zone-${APK_VERSION}.apk`;

export const getApkDownloadUrl = () => {
  const basePath = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${basePath}/apk/${APK_FILE_NAME}`;
};

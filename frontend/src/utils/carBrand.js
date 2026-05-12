const BRAND_DEFINITIONS = [
  { label: 'Peugeot', pattern: /\bpeugeot\b/i, stripPattern: /\bpeugeot\b[\s:.-]*/i, iconBaseName: 'peugeot' },
  { label: 'Mitsubishi', pattern: /\bmitsubishi\b/i, stripPattern: /\bmitsubishi\b[\s:.-]*/i, iconBaseName: 'mitsubishi' },
  { label: 'Ford', pattern: /\bford\b/i, stripPattern: /\bford\b[\s:.-]*/i, iconBaseName: 'ford' },
  { label: 'Citroen', pattern: /\bcitroen\b/i, stripPattern: /\bcitroen\b[\s:.-]*/i, iconBaseName: 'citroen' },
  { label: 'Subaru', pattern: /\bsubaru\b/i, stripPattern: /\bsubaru\b[\s:.-]*/i, iconBaseName: 'subaru' },
  { label: 'Toyota', pattern: /\btoyota\b/i, stripPattern: /\btoyota\b[\s:.-]*/i, iconBaseName: 'toyota' },
  { label: 'Hyundai', pattern: /\bhyundai\b/i, stripPattern: /\bhyundai\b[\s:.-]*/i, iconBaseName: 'hyundai' },
  { label: 'Skoda', pattern: /\bskoda\b/i, stripPattern: /\bskoda\b[\s:.-]*/i, iconBaseName: 'skoda' },
  { label: 'Volkswagen', pattern: /\b(?:volkswagen|vw)\b/i, stripPattern: /\b(?:volkswagen|vw)\b[\s:.-]*/i, iconBaseName: 'volkswagen' },
  { label: 'Renault', pattern: /\brenault\b/i, stripPattern: /\brenault\b[\s:.-]*/i, iconBaseName: 'renault' },
  { label: 'Fiat', pattern: /\bfiat\b/i, stripPattern: /\bfiat\b[\s:.-]*/i, iconBaseName: 'fiat' },
  { label: 'Opel', pattern: /\bopel\b/i, stripPattern: /\bopel\b[\s:.-]*/i, iconBaseName: 'opel' },
  { label: 'Lancia', pattern: /\blancia\b/i, stripPattern: /\blancia\b[\s:.-]*/i, iconBaseName: 'lancia' },
  { label: 'Mini', pattern: /\bmini\b/i, stripPattern: /\bmini\b[\s:.-]*/i, iconBaseName: 'mini' },
  { label: 'Porsche', pattern: /\bporsche\b/i, stripPattern: /\bporsche\b[\s:.-]*/i, iconBaseName: 'porsche' },
  { label: 'BMW', pattern: /\bbmw\b/i, stripPattern: /\bbmw\b[\s:.-]*/i, iconBaseName: 'bmw' },
  { label: 'Audi', pattern: /\baudi\b/i, stripPattern: /\baudi\b[\s:.-]*/i, iconBaseName: 'audi' },
  { label: 'Seat', pattern: /\bseat\b/i, stripPattern: /\bseat\b[\s:.-]*/i, iconBaseName: 'seat' },
  { label: 'Suzuki', pattern: /\bsuzuki\b/i, stripPattern: /\bsuzuki\b[\s:.-]*/i, iconBaseName: 'suzuki' },
  { label: 'Dacia', pattern: /\bdacia\b/i, stripPattern: /\bdacia\b[\s:.-]*/i, iconBaseName: 'dacia' },
  { label: 'Mazda', pattern: /\bmazda\b/i, stripPattern: /\bmazda\b[\s:.-]*/i, iconBaseName: 'mazda' },
  { label: 'Nissan', pattern: /\bnissan\b/i, stripPattern: /\bnissan\b[\s:.-]*/i, iconBaseName: 'nissan' },
  { label: 'Honda', pattern: /\bhonda\b/i, stripPattern: /\bhonda\b[\s:.-]*/i, iconBaseName: 'honda' },
  { label: 'Alfa Romeo', pattern: /\balfa\s+romeo\b/i, stripPattern: /\balfa\s+romeo\b[\s:.-]*/i, iconBaseName: 'alfa-romeo' },
  { label: 'Vauxhall', pattern: /\bvauxhall\b/i, stripPattern: /\bvauxhall\b[\s:.-]*/i, iconBaseName: 'vauxhall' },
  { label: 'MG', pattern: /\bmg\b/i, stripPattern: /\bmg\b[\s:.-]*/i, iconBaseName: 'mg' },
  { label: 'Proton', pattern: /\bproton\b/i, stripPattern: /\bproton\b[\s:.-]*/i, iconBaseName: 'proton' },
  { label: 'Isuzu', pattern: /\bisuzu\b/i, stripPattern: /\bisuzu\b[\s:.-]*/i, iconBaseName: 'isuzu' },
  { label: 'Volvo', pattern: /\bvolvo\b/i, stripPattern: /\bvolvo\b[\s:.-]*/i, iconBaseName: 'volvo' },
  { label: 'Saab', pattern: /\bsaab\b/i, stripPattern: /\bsaab\b[\s:.-]*/i, iconBaseName: 'saab' }
];

const normalizeBrandText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
);

const stripBrandPrefix = (carName, stripPattern, fallbackLabel) => {
  const trimmed = String(carName || '').trim();
  if (!trimmed) {
    return '';
  }

  const stripped = trimmed.replace(stripPattern, '').trim();
  return stripped || fallbackLabel || trimmed;
};

export const getPilotCarBrandInfo = (carName = '') => {
  const normalized = normalizeBrandText(carName);
  if (!normalized) {
    return null;
  }

  for (const definition of BRAND_DEFINITIONS) {
    if (definition.pattern.test(normalized)) {
      return {
        label: definition.label,
        iconBaseName: definition.iconBaseName,
        displayText: stripBrandPrefix(carName, definition.stripPattern, definition.label)
      };
    }
  }

  return {
    label: String(carName || '').trim() || 'Car',
    iconBaseName: '',
    displayText: String(carName || '').trim() || 'Car'
  };
};

export const getPilotCarDisplayText = (carName = '') => {
  const brandInfo = getPilotCarBrandInfo(carName);
  return brandInfo?.displayText || String(carName || '').trim();
};

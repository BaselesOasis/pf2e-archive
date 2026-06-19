import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// pf2e Repo klonen falls nicht vorhanden
const PF2E_REPO = 'external/pf2e';

if (!fs.existsSync(PF2E_REPO)) {
  console.log('Cloning pf2e repo (this may take a moment)...');
  execSync('git clone --depth 1 https://github.com/foundryvtt/pf2e.git external/pf2e', {
    stdio: 'inherit'
  });
  console.log('Done cloning.\n');
}

const PF2E_DIR = 'external/pf2e/packs/pf2e';
const OUTPUT_DIR = 'src/data';

// Packs, die wir extrahieren wollen
const PACKS = [
  { source: 'spells',      type: 'spell',      label: 'Spells' },
  { source: 'feats',       type: 'feat',       label: 'Feats' },
  { source: 'equipment',   type: 'equipment',  label: 'Equipment' },
  { source: 'ancestries',  type: 'ancestry',   label: 'Ancestries' },
  { source: 'classes',     type: 'class',      label: 'Classes' },
  { source: 'backgrounds', type: 'background', label: 'Backgrounds' },
  { source: 'conditions',  type: 'condition',  label: 'Conditions' },
];

// Hilfsfunktion: Alle .json Dateien rekursiv finden (ignoriert _folders.json)
function findJsonFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json') && entry.name !== '_folders.json') {
      results.push(fullPath);
    }
  }
  return results;
}

// Hilfsfunktion: URL-freundlichen Slug erstellen
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Hilfsfunktion: Preis formatieren
function formatPrice(priceObj) {
  if (!priceObj) return '—';
  const parts = [];
  if (priceObj.pp) parts.push(`${priceObj.pp} pp`);
  if (priceObj.gp) parts.push(`${priceObj.gp} gp`);
  if (priceObj.sp) parts.push(`${priceObj.sp} sp`);
  if (priceObj.cp) parts.push(`${priceObj.cp} cp`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

// Hilfsfunktion: Ability-Boosts formatieren
function formatBoosts(boosts) {
  if (!boosts) return [];
  const result = [];
  for (const key of Object.keys(boosts)) {
    const boost = boosts[key];
    if (boost.value && boost.value.length > 0) {
      result.push({
        slot: parseInt(key),
        options: boost.value
      });
    }
  }
  return result;
}

// Hilfsfunktion: Eintragsdaten bereinigen und normalisieren
function sanitizeEntry(entry, packType) {
  const base = {
    id: entry._id,
    name: entry.name,
    type: entry.type || packType,
    img: entry.img || null,
    slug: slugify(entry.name),
    description: entry.system?.description?.value || '',
    level: entry.system?.level?.value ?? null,
    rarity: entry.system?.traits?.rarity || 'common',
    traits: entry.system?.traits?.value || [],
    publication: entry.system?.publication || null,
  };

  // Spells
  if (packType === 'spell') {
    base.castTime = entry.system?.time?.value || null;
    base.range = entry.system?.range?.value || null;
    base.area = entry.system?.area ? `${entry.system.area.value} ${entry.system.area.type}` : null;
    base.duration = entry.system?.duration?.value || null;
    base.defense = entry.system?.defense?.save
      ? `basic ${entry.system.defense.save.statistic}` : null;
    base.traditions = entry.system?.traits?.traditions || [];
    base.damage = entry.system?.damage || {};
  }

  // Feats
  if (packType === 'feat') {
    base.category = entry.system?.category || null;
    base.actionType = entry.system?.actionType?.value || 'passive';
    base.prerequisites = entry.system?.prerequisites?.value || [];
  }

  // Equipment
  if (packType === 'equipment') {
    base.subType = entry.type || null;
    base.bulk = entry.system?.bulk?.value ?? null;
    base.price = formatPrice(entry.system?.price?.value);
    base.size = entry.system?.size || null;
    base.hardness = entry.system?.hardness ?? null;
    base.hp = entry.system?.hp?.max ?? null;
    base.baseItem = entry.system?.baseItem || null;
  }

  // Ancestries
  if (packType === 'ancestry') {
    base.hp = entry.system?.hp ?? null;
    base.size = entry.system?.size || null;
    base.speed = entry.system?.speed ?? null;
    base.vision = entry.system?.vision || 'normal';
    base.boosts = formatBoosts(entry.system?.boosts);
    base.flaws = formatBoosts(entry.system?.flaws);
    base.languages = entry.system?.languages?.value || [];
    base.additionalLanguages = entry.system?.additionalLanguages?.value || [];
  }

  // Classes
  if (packType === 'class') {
    base.hp = entry.system?.hp ?? null;
    base.keyAbility = entry.system?.keyAbility?.value || [];
    base.savingThrows = entry.system?.savingThrows || {};
    base.defenses = entry.system?.defenses || {};
    base.attacks = entry.system?.attacks || {};
    base.perception = entry.system?.perception ?? null;
    base.trainedSkills = entry.system?.trainedSkills || {};
    base.spellcasting = entry.system?.spellcasting ?? 0;
  }

  // Backgrounds
  if (packType === 'background') {
    base.boosts = formatBoosts(entry.system?.boosts);
    base.trainedSkills = entry.system?.trainedSkills || {};
  }

  // Conditions
  if (packType === 'condition') {
    base.group = entry.system?.group || null;
    base.duration = entry.system?.duration?.unit || 'unlimited';
    base.overrides = entry.system?.overrides || [];
  }

  return base;
}

// Hauptlogik
const allEntries = [];

// Sicherstellen, dass der Output-Ordner existiert
if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const pack of PACKS) {
  const sourcePath = path.join(PF2E_DIR, pack.source);

  if (!fs.existsSync(sourcePath)) {
    console.warn(`⚠ Pack not found: ${sourcePath}`);
    continue;
  }

  const files = findJsonFiles(sourcePath);
  const entries = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));

      // Nur Einträge mit Namen übernehmen (überspringt leere/kaputte Dateien)
      if (!raw.name) continue;

      const entry = sanitizeEntry(raw, pack.type);
      entry.pack = pack.source;
      entries.push(entry);
    } catch (e) {
      console.warn(`⚠ Error parsing ${file}: ${e.message}`);
    }
  }

  // Nach Name sortieren
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const outputPath = path.join(OUTPUT_DIR, `${pack.source}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
  console.log(`✓ ${pack.label}: ${entries.length} entries → ${outputPath}`);

  for (const entry of entries) {
    allEntries.push(entry);
  }
}

// Gesamten Index schreiben
allEntries.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'index.json'),
  JSON.stringify(allEntries, null, 2)
);
console.log(`✓ Total index: ${allEntries.length} entries → src/data/index.json`);

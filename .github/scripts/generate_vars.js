const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(process.cwd(), 'data.json');
const VARS_OUTPUT_PATH = path.join(process.cwd(), 'variables.json');
const DEFAULT_VARS_PATH = path.join(process.cwd(), 'default_variables.json');

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Error: ${DATA_PATH} not found.`);
    process.exit(1);
  }

  const dataContent = fs.readFileSync(DATA_PATH, 'utf-8');
  let issues;
  try {
    issues = JSON.parse(dataContent);
  } catch (e) {
    console.error('Error parsing data.json:', e);
    process.exit(1);
  }

  // Map<string, Set<string>>
  const variablesMap = new Map();

  // 1. Load Existing variables.json (Persistence)
  if (fs.existsSync(VARS_OUTPUT_PATH)) {
    try {
      const existingContent = fs.readFileSync(VARS_OUTPUT_PATH, 'utf-8');
      const existingVars = JSON.parse(existingContent);
      Object.keys(existingVars).forEach(key => {
        if (!variablesMap.has(key)) {
          variablesMap.set(key, new Set());
        }
        const set = variablesMap.get(key);
        if (Array.isArray(existingVars[key])) {
          existingVars[key].forEach(v => set.add(v));
        }
      });
      console.log(`Loaded existing variables from ${VARS_OUTPUT_PATH}`);
    } catch (e) {
      console.error('Error parsing existing variables.json:', e);
    }
  }

  // 2. Load Default Variables (Seeds)
  if (fs.existsSync(DEFAULT_VARS_PATH)) {
    try {
      const defaultContent = fs.readFileSync(DEFAULT_VARS_PATH, 'utf-8');
      const defaultVars = JSON.parse(defaultContent);
      
      Object.keys(defaultVars).forEach(rawKey => {
        const key = normalizeKey(rawKey);
        if (!key) return;
        
        if (!variablesMap.has(key)) {
          variablesMap.set(key, new Set());
        }
        const set = variablesMap.get(key);
        
        const values = defaultVars[rawKey];
        if (Array.isArray(values)) {
          values.forEach(v => set.add(v));
        }
      });
      console.log(`Loaded default variables from ${DEFAULT_VARS_PATH}`);
    } catch (e) {
      console.error('Error parsing default_variables.json:', e);
    }
  }

  // 3. Load variables from Issues (New/Current data)
  issues.forEach(issue => {
    const body = issue.body || '';
    const varsSection = extractVariablesSection(body);
    if (varsSection) {
      parseVariables(varsSection, variablesMap);
    }
  });

  // Convert Map to Object with sorted keys and sorted values
  const result = {};
  const sortedKeys = Array.from(variablesMap.keys()).sort();

  sortedKeys.forEach(key => {
    const values = Array.from(variablesMap.get(key)).sort((a, b) => a.localeCompare(b));
    result[key] = values;
  });

  fs.writeFileSync(VARS_OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Successfully generated variables.json with ${sortedKeys.length} keys.`);
}

/**
 * Extracts the content under the "Variables (key=value)" header.
 * Adjust the header matching based on exact label in ISSUE_TEMPLATE.
 */
function extractVariablesSection(body) {
  // More robust header matching: matches "### Variables", "Variables (key=value)", "Variables:", etc.
  const lines = body.split('\n');
  
  let capture = false;
  const extractedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if line starts with something that looks like a Variables header
    // Regexp matches "Variables" with optional ### prefix and optional suffix like (key=value) or :
    if (/^(###\s*)?Variables(\s*\(.*\))?:?$/i.test(trimmed)) {
      capture = true;
      continue;
    }
    
    // Stop at the next Markdown header (starts with ###)
    if (capture && trimmed.startsWith('### ')) {
      break;
    }
    
    if (capture) {
      extractedLines.push(line);
    }
  }

  return extractedLines.join('\n');
}

/**
 * Parses the extracted text block.
 * Format: key = value1, value2
 */
function parseVariables(text, variablesMap) {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split by first '=' or ':'
    let separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      separatorIndex = trimmed.indexOf(':');
    }

    if (separatorIndex === -1) continue;

    const keyRaw = trimmed.substring(0, separatorIndex);
    const valueRaw = trimmed.substring(separatorIndex + 1);

    const key = normalizeKey(keyRaw);
    if (!key) continue;

    const values = valueRaw.split(',').map(v => v.trim()).filter(v => v);
    
    if (!variablesMap.has(key)) {
      variablesMap.set(key, new Set());
    }
    const set = variablesMap.get(key);
    values.forEach(v => set.add(v));
  }
}

function normalizeKey(keyRaw) {
  // trim, toLowerCase.
  // Optional: replace spaces with underscore? Enhance plan says: "（建議）空白轉底線"
  // Let's implement trim and toLowerCase first as mandatory.
  let key = keyRaw.trim().toLowerCase();
  
  // Implementing optional: replace whitespace with underscore for cleaner keys
  // key = key.replace(/\s+/g, '_'); 
  // Wait, let's stick to simple trim + lower case first unless strictly required.
  // Plan says: "(建議) 空白轉底線: my key -> my_key"
  // Let's do it to be safe and cleaner.
  key = key.replace(/\s+/g, '_');
  
  return key;
}

main();

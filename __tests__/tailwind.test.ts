import fs from 'fs';
import path from 'path';
import {palette, tw} from '../src/core/theme/tw';

/**
 * Veil is styled entirely with Tailwind classes (twrnc). twrnc silently returns an empty style for a
 * class it doesn't understand (for example arbitrary flex values like `flex-[3]`), which would
 * show up as a mysteriously unstyled control. This scans every string literal in src/ and fails if a
 * Tailwind-looking class resolves to nothing.
 */
// Plain words that happen to match the class pattern (they come from text and property names).
const NOT_CLASSES = new Set(['react-native', 'min', 'opacity', 'top', 'bottom']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      sourceFiles(p, out);
    } else if (/\.tsx$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function candidateClasses(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(path.join(__dirname, '..', 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(['`])((?:\\.|(?!\1).)*?)\1/g)) {
      const body = m[2].replace(/\$\{[^}]*\}/g, ' ');
      for (const t of body.split(/\s+/)) {
        const looksLikeClass =
          /^[a-z!-][a-z0-9\-[\]#/.:%]*$/i.test(t) &&
          /(^|-)(veil|flex|border|gap|rounded|px|py|p|m|mt|mb|ml|mr|w|h|min|max|text|bg|font|items|justify|self|absolute|relative|overflow|opacity|inset|top|bottom|left|right|leading|tracking|uppercase|shrink|grow)(-|$)/.test(
            t,
          ) &&
          t.length > 1;
        if (looksLikeClass && !NOT_CLASSES.has(t)) {
          found.add(t);
        }
      }
    }
  }
  return found;
}

describe('Tailwind classes (twrnc)', () => {
  it('every class used in the app resolves to a style', () => {
    const classes = candidateClasses();
    expect(classes.size).toBeGreaterThan(80); // the scan itself works
    // Some classes (tracking-*) only resolve next to a font size, so compare against that baseline.
    const baseline = JSON.stringify(tw.style('text-[11px]'));
    const empty = [...classes].filter(
      c => JSON.stringify(tw.style('text-[11px]', c)) === baseline,
    );
    expect(empty).toEqual([]);
  });

  it('the veil palette is available as colors', () => {
    for (const [name, hex] of Object.entries(palette)) {
      expect(tw.style(`bg-veil-${name}`)).toMatchObject({backgroundColor: hex});
    }
  });

  it('typography scale and radius tokens exist', () => {
    expect(tw.style('text-display')).toMatchObject({fontSize: 30});
    expect(tw.style('text-heading')).toMatchObject({fontSize: 15});
    expect(tw.style('rounded-xxl')).toMatchObject({borderRadius: 22});
    expect(tw.style('max-w-content')).toMatchObject({maxWidth: 1120});
  });

  it('no component uses StyleSheet any more', () => {
    const offenders = sourceFiles(path.join(__dirname, '..', 'src')).filter(f =>
      /StyleSheet\.create/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

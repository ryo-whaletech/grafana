import { render } from '@testing-library/react';

import {
  applyFieldOverrides,
  createTheme,
  type DataFrame,
  FieldType,
  type GrafanaTheme2,
  ThemeContext,
  toDataFrame,
} from '@grafana/data';
import { mockClientSize } from '@grafana/test-utils';

import { TableNG } from './TableNG';

// react-data-grid sizes its virtualized viewport from the client box, which jsdom reports as 0 - without
// this the grid renders no rows at all.
beforeAll(() => {
  mockClientSize({ width: 800, height: 600 });
});

const makeFrame = (theme: GrafanaTheme2): DataFrame =>
  applyFieldOverrides({
    data: [
      toDataFrame({
        fields: [
          { name: 'name', type: FieldType.string, values: ['a', 'b', 'c', 'd'] },
          { name: 'value', type: FieldType.number, values: [1, 2, 3, 4] },
        ],
      }),
    ],
    fieldConfig: { defaults: {}, overrides: [] },
    replaceVariables: (value) => value,
    timeZone: 'utc',
    theme,
  })[0];

/** Renders the grid under `theme` and hands back the custom properties `getGridStyles` set on it. */
function gridVarsFor(theme: GrafanaTheme2, props: Partial<React.ComponentProps<typeof TableNG>> = {}) {
  const { container } = render(
    <ThemeContext.Provider value={theme}>
      <TableNG data={makeFrame(theme)} width={800} height={600} {...props} />
    </ThemeContext.Provider>
  );

  const grid = container.querySelector('[role="grid"]');
  if (!grid) {
    throw new Error('grid did not render');
  }
  const computed = window.getComputedStyle(grid);

  return {
    rowBackground: computed.getPropertyValue('--rdg-row-background-color'),
    headerBackground: computed.getPropertyValue('--rdg-header-background-color'),
    rowHoverBackground: computed.getPropertyValue('--rdg-row-hover-background-color'),
    borderColor: computed.getPropertyValue('--rdg-border-color'),
    // Emotion's injected rules accumulate across cases in a file, so anything read back out of the
    // stylesheet has to be scoped to the class this render actually produced.
    gridClass: Array.from(grid.classList).find((c) => c.startsWith('css-')) ?? '',
    /** Background each body row resolves to, in document order. */
    rowBackgrounds: Array.from(container.querySelectorAll('.rdg-row:not(.rdg-summary-row)')).map(
      (row) => window.getComputedStyle(row).backgroundColor
    ),
  };
}

/** Accepts the several shapes these colors come back in: `#rrggbb`, `rgb(...)` and `rgba(...)`. */
const parseRgb = (color: string): [number, number, number] => {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hex) {
    return [1, 2, 3].map((i) => parseInt(hex[i], 16)) as [number, number, number];
  }
  const rgb = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) {
    throw new Error(`could not parse ${color}`);
  }
  return [+rgb[1], +rgb[2], +rgb[3]];
};

/**
 * Composites the overlay the hover rule carries over `background`, giving the color a hovered row
 * actually resolves to. Read out of the injected stylesheet rather than asserted as a literal,
 * because jsdom may normalize `rgba()` to 8-digit hex on the way in.
 */
function hoverOverlayOver(background: string, gridClass: string): [number, number, number] {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        !rule.cssText.startsWith(`.${gridClass} `) ||
        !/:hover>\.rdg-cell \{background-image: linear-gradient\(/.test(rule.cssText)
      ) {
        continue;
      }
      const overlay = rule.cssText.match(/linear-gradient\((#[0-9a-f]{8}|rgba?\([^)]*\))/i)?.[1];
      if (!overlay) {
        throw new Error(`could not find an overlay color in ${rule.cssText}`);
      }
      const hex = overlay.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      const rgb = hex ? ([1, 2, 3].map((i) => parseInt(hex[i], 16)) as [number, number, number]) : parseRgb(overlay);
      const alpha = hex ? parseInt(hex[4], 16) / 255 : Number(overlay.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
      const base = parseRgb(background);
      return rgb.map((o, i) => Math.round(base[i] * (1 - alpha) + o * alpha)) as [number, number, number];
    }
  }
  throw new Error('no hover overlay rule was injected');
}

const darkTheme = createTheme({ colors: { mode: 'dark' } });
const lightTheme = createTheme({ colors: { mode: 'light' } });

describe('getGridStyles', () => {
  describe('table.refresh header surface', () => {
    it.each([
      ['dark', darkTheme, 'rgb(37, 40, 44)'],
      ['light', lightTheme, 'rgb(239, 239, 239)'],
    ])('steps the header off the row background in a %s theme', (_name, theme, expected) => {
      const { rowBackground, headerBackground } = gridVarsFor(theme, { tableRefreshEnabled: true });

      expect(headerBackground).toBe(expected);
      expect(headerBackground).not.toBe(rowBackground);
    });

    it.each([
      ['dark', darkTheme],
      ['light', lightTheme],
    ])('leaves the header on the row background with the flag off in a %s theme', (_name, theme) => {
      const { rowBackground, headerBackground } = gridVarsFor(theme, { tableRefreshEnabled: false });

      expect(headerBackground).toBe(rowBackground);
    });

    it('steps off the canvas, not the panel, when the panel is transparent', () => {
      const opaque = gridVarsFor(darkTheme, { tableRefreshEnabled: true });
      const transparent = gridVarsFor(darkTheme, { tableRefreshEnabled: true, transparent: true });

      // The canvas sits below the panel background, so the surface derived from it lands darker -
      // the point being that it is still derived, rather than falling back to a panel-relative color
      // that would read as lighter than the canvas it sits on.
      expect(transparent.headerBackground).not.toBe(opaque.headerBackground);
      expect(transparent.headerBackground).not.toBe(transparent.rowBackground);
    });
  });

  describe('table.refresh grid lines', () => {
    it('strengthens the dark-theme grid line, which border.weak loses against the header surface', () => {
      const refreshed = gridVarsFor(darkTheme, { tableRefreshEnabled: true });
      const legacy = gridVarsFor(darkTheme, { tableRefreshEnabled: false });

      expect(refreshed.borderColor).toBe('#3c3e45');
      expect(legacy.borderColor).toBe('#2e3036');
    });

    it('leaves the light-theme grid line on border.weak, where the step darkens instead', () => {
      const refreshed = gridVarsFor(lightTheme, { tableRefreshEnabled: true });
      const legacy = gridVarsFor(lightTheme, { tableRefreshEnabled: false });

      expect(refreshed.borderColor).toBe(legacy.borderColor);
    });
  });

  describe('zebra striping', () => {
    it.each([
      ['dark', darkTheme, 'rgb(33, 36, 39)'],
      ['light', lightTheme, 'rgb(244, 244, 244)'],
    ])('stripes every other row in a %s theme, starting from the second', (_name, theme, stripe) => {
      const { rowBackgrounds } = gridVarsFor(theme, { zebraStriping: true });

      expect(rowBackgrounds).toHaveLength(4);
      // The first row keeps the plain row background, which the grid sets as a custom property
      // rather than a color of its own - so the stripe is what distinguishes them here.
      expect(rowBackgrounds[1]).toBe(stripe);
      expect(rowBackgrounds[3]).toBe(stripe);
      expect(rowBackgrounds[0]).not.toBe(stripe);
      expect(rowBackgrounds[2]).not.toBe(stripe);
    });

    it('leaves every row on the same background with the option off', () => {
      const { rowBackgrounds } = gridVarsFor(darkTheme, { zebraStriping: false });

      expect(rowBackgrounds).toHaveLength(4);
      expect(new Set(rowBackgrounds).size).toBe(1);
    });
  });

  // Hover is painted as an overlay on the hovered cells, which jsdom never applies `:hover` to. So
  // these assert the two halves that are assertable: that the swap no longer moves the color, and
  // that the overlay the rule carries is the one we meant.
  describe('row hover', () => {
    it.each([
      ['table.refresh alone', { tableRefreshEnabled: true, zebraStriping: false }],
      ['striping alone', { tableRefreshEnabled: false, zebraStriping: true }],
      ['both', { tableRefreshEnabled: true, zebraStriping: true }],
    ])('stops the hover swap moving the row background, with %s', (_name, props) => {
      const { rowHoverBackground } = gridVarsFor(darkTheme, props);

      expect(rowHoverBackground).toBe('var(--rdg-row-background-color)');
    });

    it('keeps the legacy hover color when neither is on', () => {
      const { rowHoverBackground, rowBackground } = gridVarsFor(darkTheme, {
        tableRefreshEnabled: false,
        zebraStriping: false,
      });

      expect(rowHoverBackground).toBe(darkTheme.colors.background.secondary);
      expect(rowHoverBackground).not.toBe(rowBackground);
    });

    // The regression this replaces: hover *was* the header surface, so once the header stepped
    // further off the rows a hovered row read as a second header band.
    it.each([
      ['dark', darkTheme],
      ['light', lightTheme],
    ])('lifts off the row it is on rather than taking the header surface, in a %s theme', (_name, theme) => {
      const { rowBackground, headerBackground, gridClass } = gridVarsFor(theme, { tableRefreshEnabled: true });

      // Compositing white (or black) at alpha k is what `emphasize(color, k)` does, so a hovered
      // row resolves to its own background emphasized - twice the header's 0.06 step, which is what
      // puts hover past the header instead of on it. Within a point per channel, because the alpha
      // loses a little precision on its way through the stylesheet.
      const hovered = hoverOverlayOver(rowBackground, gridClass);
      const emphasized = parseRgb(theme.colors.emphasize(rowBackground, 0.12));

      hovered.forEach((channel, i) => expect(Math.abs(channel - emphasized[i])).toBeLessThanOrEqual(1));

      // The regression: hover used to land exactly on the header surface.
      const header = parseRgb(headerBackground);
      expect(hovered.some((channel, i) => Math.abs(channel - header[i]) > 8)).toBe(true);
    });
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureSchema } from './captureSchema';

function docFromHtml(html: string): Document {
  const dom = new JSDOM(html, { url: 'https://pm.eyefinity.com/Patient/NewExam?id=123' });
  // jsdom reports offsetParent as null for every element by default (no layout engine);
  // stub it so visible-field filtering in captureSchema behaves like a real browser.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', {
    get() {
      return this.closest('[data-hidden]') ? null : dom.window.document.body;
    },
  });
  return dom.window.document;
}

describe('captureSchema', () => {
  it('captures a labelled input with its selector and current value', () => {
    const doc = docFromHtml(`
      <label for="provider">Provider</label>
      <select id="provider"><option value="1">Dr. Priya Bhuta</option></select>
    `);
    const schema = captureSchema(doc, 'examForm');
    expect(schema.formType).toBe('examForm');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0]).toMatchObject({
      key: 'provider',
      label: 'Provider',
      selector: '#provider',
      elementType: 'select',
    });
  });

  it('falls back to nearby row text when there is no associated <label>', () => {
    const doc = docFromHtml(`
      <table><tbody>
        <tr><th>Procedure Code</th><td><select><option value="x">Select</option></select></td></tr>
      </tbody></table>
    `);
    const schema = captureSchema(doc, 'examForm');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0]?.label).toBe('Procedure Code');
  });

  it('skips hidden and button-like inputs', () => {
    const doc = docFromHtml(`
      <input type="hidden" name="csrf" value="abc" />
      <input type="submit" value="Save" />
      <label for="dob">Date of Birth</label>
      <input id="dob" type="text" value="02/25/1958" />
    `);
    const schema = captureSchema(doc, 'examForm');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0]?.key).toBe('date-of-birth');
  });

  it('skips fields hidden via layout (no offsetParent)', () => {
    const doc = docFromHtml(`
      <div data-hidden>
        <label for="hiddenField">Hidden</label>
        <input id="hiddenField" type="text" />
      </div>
      <label for="visible">Visible</label>
      <input id="visible" type="text" />
    `);
    const schema = captureSchema(doc, 'examForm');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0]?.key).toBe('visible');
  });

  it('dedupes field keys derived from identical labels', () => {
    const doc = docFromHtml(`
      <label for="a">Diagnosis Code</label><input id="a" />
      <label for="b">Diagnosis Code</label><input id="b" />
    `);
    const schema = captureSchema(doc, 'examForm');
    const keys = schema.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(2);
  });
});

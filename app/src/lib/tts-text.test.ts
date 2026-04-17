import { describe, expect, it } from 'vitest';
import { optimizeMarkdownForSpeech } from './tts-text';

describe('optimizeMarkdownForSpeech', () => {
	it('adds audible punctuation to markdown headings, lines, and lists', () => {
		const result = optimizeMarkdownForSpeech(`# Launch notes
One sentence without punctuation
- first item
- second item`);

		expect(result).toBe(`Launch notes:
One sentence without punctuation.
first item;
second item;`);
	});

	it('normalizes common markdown syntax without using the link URL', () => {
		const result = optimizeMarkdownForSpeech(
			'Read **the [guide](https://example.com/docs)** before `launch`',
		);

		expect(result).toBe('Read the guide before launch.');
	});

	it('converts dollars, cents, percentages, and ampersands to spoken words', () => {
		const result = optimizeMarkdownForSpeech(
			'Revenue was $40.50 & margin was 12%',
		);

		expect(result).toBe(
			'Revenue was 40 dollars and 50 cents and margin was 12 percent.',
		);
	});

	it('removes markdown table dividers and makes table cells pauseable', () => {
		const result = optimizeMarkdownForSpeech(`| Name | Price |
| --- | --- |
| Basic | $9 |`);

		expect(result).toBe(`Name, Price.
Basic, 9 dollars.`);
	});
});

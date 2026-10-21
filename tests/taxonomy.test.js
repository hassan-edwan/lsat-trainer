import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStem, stemFeatureTags } from '../src/lib/taxonomy.js';

const LR = [
  ['The reasoning in the argument is most vulnerable to criticism on the grounds that it', 'flaw'],
  ['The argument is flawed because it', 'flaw'],
  ['Which one of the following is an assumption on which the argument depends?', 'necessary-assumption'],
  ['Which one of the following is an assumption required by the argument?', 'necessary-assumption'],
  ['The argument relies on the assumption that', 'necessary-assumption'],
  ['The conclusion of the argument follows logically if which one of the following is assumed?', 'sufficient-assumption'],
  ['Which one of the following, if assumed, enables the conclusion to be properly drawn?', 'sufficient-assumption'],
  ['Which one of the following, if true, most strengthens the argument?', 'strengthen'],
  ['Which one of the following, if true, most seriously weakens the argument?', 'weaken'],
  ['Which one of the following, if true, casts the most doubt on the argument?', 'weaken'],
  ['The statements above, if true, most strongly support which one of the following?', 'most-strongly-supported'],
  ['If the statements above are true, which one of the following must also be true?', 'must-be-true'],
  ['Which one of the following can be properly inferred from the statements above?', 'must-be-true'],
  ['If the statements above are true, each of the following could be true EXCEPT:', 'must-be-false'],
  ['Which one of the following, if true, most helps to resolve the apparent discrepancy described above?', 'explain'],
  ['Which one of the following, if true, most helps to explain the surprising finding?', 'explain'],
  ['Which one of the following principles, if valid, most helps to justify the reasoning above?', 'principle-strengthen'],
  ['Which one of the following judgments most closely conforms to the principle stated above?', 'principle-apply'],
  ['The pattern of reasoning in which one of the following is most similar to that in the argument above?', 'parallel'],
  ['The flawed pattern of reasoning in the argument above is most similar to that in which one of the following?', 'parallel-flaw'],
  ['The argument proceeds by', 'method'],
  ["Which one of the following most accurately describes the technique of reasoning employed by the argument?", 'method'],
  ['The claim that X figures in the argument in which one of the following ways?', 'role'],
  ['Which one of the following most accurately describes the role played in the argument by the claim that X?', 'role'],
  ['Which one of the following most accurately expresses the overall conclusion drawn in the argument?', 'main-conclusion'],
  ['The main point of the argument is that', 'main-conclusion'],
  ['Alicia and Benjamin disagree over whether', 'point-at-issue'],
  ['The dialogue provides the most support for the claim that Kim and Lee agree that', 'point-at-issue'],
  ['Which one of the following would it be most useful to know in order to evaluate the argument?', 'evaluate'],
];

const RC = [
  ['Which one of the following most accurately expresses the main point of the passage?', 'rc-main-point'],
  ['The primary purpose of the passage is to', 'rc-main-point'],
  ['According to the passage, which one of the following is true of X?', 'rc-detail'],
  ['It can be inferred from the passage that the author would most likely agree with which one of the following?', 'rc-inference'],
  ['The author mentions X primarily in order to', 'rc-function'],
  ["The author's attitude toward X is best described as", 'rc-author-attitude'],
  ['Which one of the following best describes the organization of the passage?', 'rc-structure'],
  ['Which one of the following is most analogous to the situation described in the second paragraph?', 'rc-analogy'],
  ['Which one of the following, if true, would most weaken the claim in lines 10-12?', 'rc-strengthen-weaken'],
  ['Which one of the following most accurately describes the relationship between passage A and passage B?', 'rc-comparative'],
];

function mismatches(cases, kind) {
  return cases
    .map(([stem, type]) => ({ stem, expected: type, got: classifyStem(stem, kind)[0] }))
    .filter((c) => c.got !== c.expected);
}

test('classifies common LR stems', () => {
  assert.deepEqual(mismatches(LR, 'LR'), []);
});

test('classifies common RC stems', () => {
  assert.deepEqual(mismatches(RC, 'RC'), []);
});

test('falls back to other', () => {
  assert.deepEqual(classifyStem('Something unusual', 'LR'), ['lr-other']);
});

test('detects EXCEPT stems', () => {
  assert.deepEqual(stemFeatureTags('Each of the following weakens the argument EXCEPT:'), ['except']);
});

test('classifies classic stem variants', () => {
  const cases = [
    ['Which one of the following, if true, most helps explain how newborn animals manage to survive?', 'explain'],
    ['Which one of the following most logically completes the argument?', 'most-strongly-supported'],
    ["Which one of the following, if true, most undermines the mayor's defense?", 'weaken'],
    ['The reasoning in the argument requires which one of the following assumptions?', 'necessary-assumption'],
    ["The conclusion of the reviewer's argument can be properly drawn if which one of the following is assumed?", 'sufficient-assumption'],
    ['The principle stated above most helps to justify the reasoning in which one of the following arguments?', 'principle-apply'],
    ['The principle underlying the argument above is most similar to the principle underlying which one of the following arguments?', 'parallel'],
    ["The argument's reasoning is questionable in that the argument", 'flaw'],
    ["Which one of the following most accurately describes a flaw in the argument's reasoning?", 'flaw'],
    ['The answer to which one of the following questions most helps in evaluating the argument?', 'evaluate'],
    ['The dialogue most strongly supports the claim that Ana and Ben agree that', 'point-at-issue'],
    ['The statement that the core is charged plays which one of the following roles in the argument above?', 'role'],
  ];
  assert.deepEqual(cases.map(([s, t]) => ({ s, t, got: classifyStem(s, 'LR')[0] })).filter((c) => c.got !== c.t), []);
});

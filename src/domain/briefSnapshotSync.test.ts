// Drift guard: the morningBrief function redeclares BriefSnapshot (functions can't import src/).
// If the two shapes stop being mutually assignable, `tsc --noEmit` fails here.
import type { BriefSnapshot as SrcSnapshot } from './types';
import type { BriefSnapshot as FnSnapshot } from '../../base44/functions/morningBrief/brief.ts';

it('BriefSnapshot in src and in the morningBrief function stay in sync', () => {
  const a: SrcSnapshot = {} as FnSnapshot;
  const b: FnSnapshot = {} as SrcSnapshot;
  expect([a, b]).toHaveLength(2);
});

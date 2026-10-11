import assert from 'assert';
import gvar from '../src/tables/gvar.mjs';

describe('large gvar serialization', function() {
    it('writes large glyph payloads without spreading them into function arguments', function() {
        const headers = Array.from({length: 3000}, (_, i) => ({
            peakTuple: [(i + 1) / 3000],
            deltas: Array(80).fill(100),
            deltasY: Array(80).fill(-100),
        }));
        const fvar = {axes: [{tag: 'wght'}]};
        const encoded = gvar.make({sharedTuples: [], glyphVariations: {0: {headers}}}, fvar).encode();
        assert.ok(encoded.length > 400000);
        const parsed = gvar.parse(new DataView(Uint8Array.from(encoded).buffer), 0, fvar, {
            length: 1, get: () => ({points: Array(76).fill({x: 0, y: 0})}),
        });
        assert.equal(parsed.glyphVariations[0].headers.length, 3000);
        assert.deepEqual(parsed.glyphVariations[0].headers[2999].deltas, headers[2999].deltas);
    });
    it('rejects tuple counts that cannot fit the binary field', function() {
        assert.throws(() => gvar.make({glyphVariations: {0: {
            headers: Array(4096).fill({peakTuple: [1], deltas: [], deltasY: []}),
        }}}, {axes: [{tag: 'wght'}]}), /4095 tuple/);
    });
});

describe('gvar point selection', function() {
    it('explicitly selects all points when there is no shared point list', function() {
        const fvar = {axes: [{tag: 'wght'}]};
        const headers = [{peakTuple:[1],deltas:[20,-30,0,0,0,0,0],deltasY:[40,0,0,0,0,0,0]}];
        const bytes = gvar.make({glyphVariations:{0:{headers}}},fvar).encode();
        const parsed = gvar.parse(new DataView(Uint8Array.from(bytes).buffer),0,fvar,{length:1,get:()=>({points:Array(3).fill({x:0,y:0})})});
        const tuple = parsed.glyphVariations[0].headers[0];
        assert.equal(tuple.privatePointNumbers,true,'tuple must explicitly select all points for native consumers');
        assert.deepEqual(tuple.privatePoints,[],'zero point-count is the all-points marker');
        assert.deepEqual(tuple.deltas,headers[0].deltas);
        assert.deepEqual(tuple.deltasY,headers[0].deltasY);
    });
    it('continues to select an explicit shared point list', function() {
        const fvar = {axes: [{tag: 'wght'}]};
        const bytes = gvar.make({glyphVariations:{0:{sharedPoints:[0,2],headers:[{peakTuple:[1],deltas:[20,30],deltasY:[40,50]}]}}},fvar).encode();
        const parsed = gvar.parse(new DataView(Uint8Array.from(bytes).buffer),0,fvar,{length:1,get:()=>({points:Array(3).fill({x:0,y:0})})});
        assert.equal(parsed.glyphVariations[0].headers[0].privatePointNumbers,false);
        assert.deepEqual(parsed.glyphVariations[0].sharedPoints,[0,2]);
        assert.deepEqual(parsed.glyphVariations[0].headers[0].deltas,[20,30]);
    });
});

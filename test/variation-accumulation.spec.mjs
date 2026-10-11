import assert from 'assert';
import {VariationProcessor} from '../src/variationprocessor.mjs';

describe('gvar tuple accumulation', function() {
    it('sums fractional tuple contributions before rounding the result', function() {
        const font={tables:{fvar:{axes:[{tag:'wght',minValue:0,defaultValue:0,maxValue:1}]},gvar:{sharedTuples:[]}}};
        const processor=new VariationProcessor(font);
        const points=[{x:100,y:100,onCurve:true,lastPointOfContour:true}];
        const header={peakTuple:[1],deltas:[1],deltasY:[-1],privatePoints:[]};
        const result=processor.applyTupleVariationStore({sharedPoints:[],headers:Array(10).fill(header)},points,{wght:.4});
        assert.equal(result[0].x,104);
        assert.equal(result[0].y,96);
        assert.deepEqual(points,[{x:100,y:100,onCurve:true,lastPointOfContour:true}]);
    });
});

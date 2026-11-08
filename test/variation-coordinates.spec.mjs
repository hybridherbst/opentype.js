import assert from 'assert';
import { normalizeAxisValue, denormalizeAxisValue, applyAvarMapping, invertAvarMapping, normalizeCoordinates } from '../src/opentype.mjs';

const wght = { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 };
const avarMaps = [
    { fromCoordinate: -1, toCoordinate: -1 },
    { fromCoordinate: 0, toCoordinate: 0 },
    { fromCoordinate: 0.5, toCoordinate: 0.8 },
    { fromCoordinate: 1, toCoordinate: 1 },
];

describe('variation coordinates', function() {
    it('normalizes around the default, piecewise', function() {
        assert.equal(normalizeAxisValue(400, wght), 0);
        assert.equal(normalizeAxisValue(250, wght), -0.5);
        assert.equal(normalizeAxisValue(700, wght), 0.6);
        assert.equal(normalizeAxisValue(5, { minValue: 5, defaultValue: 5, maxValue: 5 }), 0);
        for (const value of [100, 250, 400, 650, 900]) assert.ok(Math.abs(denormalizeAxisValue(normalizeAxisValue(value, wght), wght) - value) < 1e-12);
    });

    it('applies avar piecewise linearly and inverts it', function() {
        assert.equal(applyAvarMapping(0.25, avarMaps), 0.4);
        assert.equal(applyAvarMapping(0.5, avarMaps), 0.8);
        assert.equal(applyAvarMapping(0.3, []), 0.3);
        for (const value of [-1, -0.4, 0, 0.25, 0.5, 0.75, 1]) assert.ok(Math.abs(invertAvarMapping(applyAvarMapping(value, avarMaps), avarMaps) - value) < 1e-12);
    });

    it('inverts a plateau to the preferred input within it', function() {
        const plateau = [{ fromCoordinate: -1, toCoordinate: -1 }, { fromCoordinate: 0, toCoordinate: 0 }, { fromCoordinate: 0.2, toCoordinate: 0.5 }, { fromCoordinate: 0.6, toCoordinate: 0.5 }, { fromCoordinate: 1, toCoordinate: 1 }];
        assert.equal(invertAvarMapping(0.5, plateau, 0.4), 0.4);
        assert.equal(invertAvarMapping(0.5, plateau, 0.9), 0.6);
    });

    it('normalizes coordinates by axis order with the avar table', function() {
        const axes = [wght, { tag: 'wdth', minValue: 50, defaultValue: 100, maxValue: 200 }];
        const avar = { axisSegmentMaps: [{ axisValueMaps: avarMaps }, { axisValueMaps: [] }] };
        assert.deepEqual(normalizeCoordinates({ wght: 650 }, axes, avar), [0.8, 0]);
        assert.deepEqual(normalizeCoordinates({ wdth: 75 }, axes, null), [0, -0.5]);
    });
});

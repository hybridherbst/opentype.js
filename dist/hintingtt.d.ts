export default Hinting;
declare function Hinting(font: any): void;
declare class Hinting {
    constructor(font: any);
    font: any;
    getCommands: (hPoints: any) => any[];
    _fpgmState: State;
    _prepState: State;
    _errorState: number;
    exec(glyph: any, ppem: any): any;
}
declare function State(env: any, prog: any): void;
declare class State {
    constructor(env: any, prog: any);
    env: any;
    stack: any[];
    prog: any;
    zp0: number;
    zp1: number;
    zp2: number;
    rp0: number;
    rp1: number;
    rp2: number;
    fv: {
        x: number;
        y: number;
        axis: string;
        distance: (p1: any, p2: any, o1: any, o2: any) => number;
        interpolate: (p: any, rp1: any, rp2: any, pv: any) => void;
        normalSlope: number;
        setRelative: (p: any, rp: any, d: any, pv: any, org: any) => void;
        slope: number;
        touch: (p: any) => void;
        touched: (p: any) => any;
        untouch: (p: any) => void;
    };
    pv: {
        x: number;
        y: number;
        axis: string;
        distance: (p1: any, p2: any, o1: any, o2: any) => number;
        interpolate: (p: any, rp1: any, rp2: any, pv: any) => void;
        normalSlope: number;
        setRelative: (p: any, rp: any, d: any, pv: any, org: any) => void;
        slope: number;
        touch: (p: any) => void;
        touched: (p: any) => any;
        untouch: (p: any) => void;
    };
    dpv: {
        x: number;
        y: number;
        axis: string;
        distance: (p1: any, p2: any, o1: any, o2: any) => number;
        interpolate: (p: any, rp1: any, rp2: any, pv: any) => void;
        normalSlope: number;
        setRelative: (p: any, rp: any, d: any, pv: any, org: any) => void;
        slope: number;
        touch: (p: any) => void;
        touched: (p: any) => any;
        untouch: (p: any) => void;
    };
    round: typeof roundToGrid;
}
declare function roundToGrid(v: any): number;
//# sourceMappingURL=hintingtt.d.ts.map
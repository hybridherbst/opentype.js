export default Tokenizer;
/**
 * Converts a string into a list of tokens
 * @param {Record<string, Function>} [events] tokenizer core events
 */
declare function Tokenizer(events?: Record<string, Function>): void;
declare class Tokenizer {
    /**
     * Converts a string into a list of tokens
     * @param {Record<string, Function>} [events] tokenizer core events
     */
    constructor(events?: Record<string, Function>);
    tokens: any[];
    registeredContexts: {};
    contextCheckers: any[];
    events: {};
    registeredModifiers: any[];
    /**
     * Checks if an index exists in the tokens list.
     * @param {number} index token index
     */
    inboundIndex(index: number): boolean;
    /**
     * Compose and apply a list of operations (replace, update, delete)
     * @param {array} RUDs replace, update and delete operations
     * TODO: Perf. Optimization (lengthBefore === lengthAfter ? dispatch once)
     */
    composeRUD(RUDs: any[]): {
        FAIL: string;
        report: any[];
    };
    /**
     * Replace a range of tokens with a list of tokens
     * @param {number} startIndex range start index
     * @param {number} offset range offset
     * @param {Array} tokens a list of tokens to replace
     * @param {boolean} silent dispatch events and update context ranges
     */
    replaceRange(startIndex: number, offset: number, tokens: any[], silent: boolean): any[] | {
        FAIL: string;
    };
    /**
     * Replace a token with another token
     * @param {number} index token index
     * @param {Token} token a token to replace
     * @param {boolean} silent dispatch events and update context ranges
     */
    replaceToken(index: number, token: Token, silent: boolean): any[] | {
        FAIL: string;
    };
    /**
     * Removes a range of tokens
     * @param {number} startIndex range start index
     * @param {number} offset range offset
     * @param {boolean} silent dispatch events and update context ranges
     */
    removeRange(startIndex: number, offset: number, silent: boolean): any[];
    /**
     * Remove a token at a certain index
     * @param {number} index token index
     * @param {boolean} silent dispatch events and update context ranges
     */
    removeToken(index: number, silent: boolean): any[] | {
        FAIL: string;
    };
    /**
     * Insert a list of tokens at a certain index
     * @param {array} tokens a list of tokens to insert
     * @param {number} index insert the list of tokens at index
     * @param {boolean} silent dispatch events and update context ranges
     */
    insertToken(tokens: any[], index: number, silent: boolean): Token[] | {
        FAIL: string;
    };
    /**
     * A state modifier that is called on 'newToken' event
     * @param {string} modifierId state modifier id
     * @param {function} condition a predicate function that returns true or false
     * @param {function} modifier a function to update token state
     */
    registerModifier(modifierId: string, condition: Function, modifier: Function): void;
    /**
     * Converts a context range into a string value
     * @param {ContextRange} range a context range
     */
    rangeToText(range: ContextRange): string;
    /**
     * Converts all tokens into a string
     */
    getText(): string;
    /**
     * Get a context by name
     * @param {string} contextName context name to get
     */
    getContext(contextName: string): any;
    /**
     * Subscribes a new event handler to an event
     * @param {string} eventName event name to subscribe to
     * @param {function} eventHandler a function to be invoked on event
     */
    on(eventName: string, eventHandler: Function): any;
    /**
     * Dispatches an event
     * @param {string} eventName event name
     * @param {unknown[]} [args] event handler arguments
     */
    dispatch(eventName: string, args?: unknown[]): void;
    /**
     * Register a new context checker
     * @param {string} contextName a unique context name
     * @param {function} contextStartCheck a predicate function that returns true on context start
     * @param {function} contextEndCheck  a predicate function that returns true on context end
     * TODO: call tokenize on registration to update context ranges with the new context.
     */
    registerContextChecker(contextName: string, contextStartCheck: Function, contextEndCheck: Function): ContextChecker | {
        FAIL: string;
    };
    /**
     * Gets a context range tokens
     * @param {ContextRange} range a context range
     */
    getRangeTokens(range: ContextRange): any[];
    /**
     * Gets the ranges of a context
     * @param {string} contextName context name
     */
    getContextRanges(contextName: string): any;
    /**
     * Resets context ranges to run context update
     */
    resetContextsRanges(): void;
    /**
     * Updates context ranges
     */
    updateContextsRanges(): void;
    /**
     * Sets the end offset of an open range
     * @param {number} offset range end offset
     * @param {string} contextName context name
     */
    setEndOffset(offset: number, contextName: string): ContextRange;
    /**
     * Runs a context check on the current context
     * @param {ContextParams} contextParams current context params
     */
    runContextCheck(contextParams: ContextParams): void;
    /**
     * Converts a text into a list of tokens
     * @param {string} text a text to tokenize
     */
    tokenize(text: string): any[];
}
/**
 * Converts a string into a list of tokens.
 */
/**
 * Create a new token
 * @param {string} char a single char
 */
export function Token(char: string): void;
export class Token {
    /**
     * Converts a string into a list of tokens.
     */
    /**
     * Create a new token
     * @param {string} char a single char
     */
    constructor(char: string);
    char: string;
    state: {};
    activeState: {
        key: string;
        value: any;
    };
    /**
     * Sets the state of a token, usually called by a state modifier.
     * @param {string} key state item key
     * @param {unknown} value state item value
     */
    setState(key: string, value: unknown): {
        key: string;
        value: any;
    };
    getState(stateId: any): any;
}
/**
 * Create an event instance
 * @param {string} eventId event unique id
 */
export function Event(eventId: string): void;
export class Event {
    /**
     * Create an event instance
     * @param {string} eventId event unique id
     */
    constructor(eventId: string);
    eventId: string;
    subscribers: any[];
    /**
     * Subscribe a handler to an event
     * @param {function} eventHandler an event handler function
     */
    subscribe(eventHandler: Function): number | {
        FAIL: string;
    };
    /**
     * Unsubscribe an event handler
     * @param {number} subsId subscription id
     */
    unsubscribe(subsId: number): void;
}
/**
 * Create a new context range
 * @param {number} startIndex range start index
 * @param {number} endOffset range end index offset
 * @param {string} contextName owner context name
 */
export function ContextRange(startIndex: number, endOffset: number, contextName: string): void;
export class ContextRange {
    /**
     * Create a new context range
     * @param {number} startIndex range start index
     * @param {number} endOffset range end index offset
     * @param {string} contextName owner context name
     */
    constructor(startIndex: number, endOffset: number, contextName: string);
    contextName: string;
    startIndex: number;
    endOffset: number;
}
/**
 * Create a context params
 * @param {Array} context a list of items
 * @param {number} currentIndex current item index
 */
export function ContextParams(context: any[], currentIndex: number): void;
export class ContextParams {
    /**
     * Create a context params
     * @param {Array} context a list of items
     * @param {number} currentIndex current item index
     */
    constructor(context: any[], currentIndex: number);
    context: any[];
    index: number;
    length: number;
    current: any;
    backtrack: any[];
    lookahead: any[];
    /**
     * Sets context params current value index
     * @param {number} index context params current value index
     */
    setCurrentIndex(index: number): void;
    /**
     * Get an item at an offset from the current value
     * example (current value is 3):
     *  1    2   [3]   4    5   |   items values
     * -2   -1    0    1    2   |   offset values
     * @param {number} offset an offset from current value index
     */
    get(offset: number): any;
}
/**
 * Check context start and end
 * @param {string} contextName a unique context name
 * @param {function} checkStart a predicate function the indicates a context's start
 * @param {function} checkEnd a predicate function the indicates a context's end
 */
declare function ContextChecker(contextName: string, checkStart: Function, checkEnd: Function): void;
declare class ContextChecker {
    /**
     * Check context start and end
     * @param {string} contextName a unique context name
     * @param {function} checkStart a predicate function the indicates a context's start
     * @param {function} checkEnd a predicate function the indicates a context's end
     */
    constructor(contextName: string, checkStart: Function, checkEnd: Function);
    contextName: string;
    openRange: any;
    ranges: any[];
    checkStart: Function;
    checkEnd: Function;
}
//# sourceMappingURL=tokenizer.d.ts.map
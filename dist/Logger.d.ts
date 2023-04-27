declare const COLOR: {
    GRAY: string;
    DARK: string;
    RED: string;
    GREEN: string;
    YELLO: string;
    PINK: string;
    TEAL: string;
    WHITE: string;
};
export default class Logger {
    private readonly actor;
    private readonly color;
    constructor(actor: string, color: keyof typeof COLOR);
    log(...message: string[]): void;
    error(...message: string[]): void;
    warn(...message: string[]): void;
    debug(...message: string[]): void;
    trace(...message: string[]): void;
}
export {};

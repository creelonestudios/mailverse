export default class Logger {
    private readonly actor;
    constructor(actor: string);
    log(message: string): void;
    error(message: string): void;
}

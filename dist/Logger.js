const ESC = "\u001b";
const RESET = ESC + "[m";
const GRAY = ESC + "[37m";
const WHITE = ESC + "[97m";
const DARK = ESC + "[90m";
const RED = ESC + "[91m";
export default class Logger {
    actor;
    constructor(actor) {
        this.actor = actor;
    }
    log(message) {
        console.log(`${GRAY}[${WHITE}${this.actor}${GRAY}]${WHITE}`, message);
    }
    error(message) {
        console.log(`${GRAY}[${RED}${this.actor}${GRAY}]${RED}`, message);
    }
}

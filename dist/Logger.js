import getConfig from "./config.js";
const ESC = "\u001b";
const RESET = ESC + "[m";
const GRAY = ESC + "[37m";
const WHITE = ESC + "[97m";
const DARK = ESC + "[90m";
const RED = ESC + "[91m";
const GREEN = ESC + "[92m";
const YELLO = ESC + "[93m";
const PINK = ESC + "[95m";
const TEAL = ESC + "[96m";
const WHITE = ESC + "[97m";
const COLOR = {
    GRAY, DARK, RED, GREEN, YELLO, PINK, TEAL, WHITE
};
export default class Logger {
    actor;
    color;
    constructor(actor, color) {
        this.actor = actor;
        this.color = color;
        if (!getConfig("debug", false)) {
            this.debug = () => { }; // only enable debug logs when debugging is on
        }
    }
    log(...message) {
        console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${GRAY}`, message.join(" "));
    }
    error(...message) {
        console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${RED}`, message.join(" "));
    }
    warn(...message) {
        console.warn(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${YELLO}`, message.join(" "));
    }
    debug(...message) {
        console.debug(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${TEAL}`, message.join(" "));
    }
    trace(...message) {
        console.trace(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${WHITE}`, message.join(" "));
    }
}
function time() {
    const d = new Date();
    const year = d.getUTCFullYear();
    const month = (d.getUTCMonth() + "").padStart(2, "0");
    const day = (d.getUTCDate() + "").padStart(2, "0");
    const hours = (d.getUTCHours() + "").padStart(2, "0");
    const mins = (d.getUTCMinutes() + "").padStart(2, "0");
    const secs = (d.getUTCSeconds() + "").padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

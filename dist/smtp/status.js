const STATUS_SUBJECTS = [
    { code: 0, name: "Other or Undefined" },
    { code: 1, name: "Addressing" },
    { code: 2, name: "Mailbox" },
    { code: 3, name: "Mail System" },
    { code: 4, name: "Network and Routing" },
    { code: 5, name: "Mail Delivery" },
    { code: 6, name: "Message Content or Media" },
    { code: 7, name: "Security or Policy" }
];
let ok = true;
const STATUS_CODES = {
    // OK
    211: { code: 211, ok },
    214: { code: 214, ok },
    220: { code: 220, ok, message: "% Service ready" },
    221: { code: 221, ok, message: "% Service closing transmission channel" },
    240: { code: 240, ok, message: "QUIT" },
    250: { code: 250, ok, message: "OK" },
    251: { code: 251, ok, message: "User not local; will forward" },
    252: { code: 252, ok },
    // intermediate OK
    334: { code: 334, ok },
    354: { code: 354, ok, message: "Start mail input" },
    // transient NOT OK
    421: { code: 421, ok: false, message: "Service not available, closing transmission channel" },
    450: { code: 450, ok: false, message: "Requested mail action not taken: mailbox unavailable" },
    451: { code: 451, ok: false, message: "Requested action aborted: local error in processing" },
    452: { code: 452, ok: false, message: "Requested action not taken: insufficient system storage" },
    455: { code: 455, ok: false, message: "Server unable to accommodate parameters" },
    // permanent NOT OK
    500: { code: 500, ok: false, message: "Syntax error, command unrecognized" },
    501: { code: 501, ok: false, message: "Syntax error in parameters or arguments" },
    502: { code: 502, ok: false, message: "Command not implemented" },
    503: { code: 503, ok: false, message: "Bad sequence of commands" },
    504: { code: 504, ok: false, message: "Command parameter is not implemented" },
    521: { code: 521, ok: false, message: "Server does not accept mail" },
    523: { code: 523, ok: false, message: "Encryption Needed" },
    550: { code: 550, ok: false, message: "Requested action not taken: mailbox unavailable" },
    551: { code: 551, ok: false, message: "User not local; please try %" },
    552: { code: 552, ok: false, message: "Requested mail action aborted: exceeded storage allocation" },
    553: { code: 553, ok: false, message: "Requested action not taken: mailbox name not allowed" },
    554: { code: 554, ok: false, message: "Transaction has failed" },
    556: { code: 556, ok: false, message: "Domain does not accept mail" }
};
const ENHANCED_STATUS_CODES = {
    "221 2.0.0": { code: 221, ok, message: "Goodbye", class: 2, subject: 0, detail: 0 },
    "235 2.7.0": { code: 235, ok, message: "Authentication succeeded", class: 2, subject: 7, detail: 0 },
    "432 4.7.12": { code: 432, ok: false, message: "A password transition is needed", class: 4, subject: 7, detail: 12 },
    "451 4.4.1": { code: 451, ok: false, message: "IMAP server unavailable", class: 4, subject: 4, detail: 1 },
    "454 4.7.0": { code: 454, ok: false, message: "Temporary authentication failure", class: 4, subject: 7, detail: 0 },
    "500 5.5.6": { code: 500, ok: false, message: "Authentication Exchange line is too long", class: 5, subject: 5, detail: 6 },
    "501 5.5.2": { code: 501, ok: false, message: "Cannot Base64-decode Client responses", class: 5, subject: 5, detail: 2 },
    "501 5.7.0": { code: 501, ok: false, message: "Client initiated Authentication Exchange", class: 5, subject: 7, detail: 0 },
    "504 5.5.4": { code: 504, ok: false, message: "Unrecognized authentication type", class: 5, subject: 5, detail: 4 },
    "530 5.7.0": { code: 530, ok: false, message: "Authentication required", class: 5, subject: 7, detail: 0 },
    "534 5.7.9": { code: 534, ok: false, message: "Authentication mechanism is too weak", class: 5, subject: 7, detail: 9 },
    "535 5.7.8": { code: 534, ok: false, message: "Authentication credentials invalid", class: 5, subject: 7, detail: 8 },
    "538 5.7.11": { code: 538, ok: false, message: "Encryption required for requested authentication mechanism", class: 5, subject: 7, detail: 11 },
    "554 5.3.4": { code: 554, ok: false, message: "Message too big for system", class: 5, subject: 7, detail: 8 }
};
export default function status(code, options) {
    if (typeof options == "string")
        options = { enhancedCode: options };
    if (!(code in STATUS_CODES))
        return `${code} ${options?.message}\r\n`;
    let statusCode = STATUS_CODES[code];
    let enhanced = false;
    if (options && options.enhancedCode) {
        if (`${code} ${options.enhancedCode}` in ENHANCED_STATUS_CODES) {
            statusCode = ENHANCED_STATUS_CODES[`${code} ${options.enhancedCode}`];
            enhanced = true;
        }
    }
    let message;
    if (statusCode.message?.includes("%") && options?.args)
        message = replaceArgs(statusCode, options.args, options?.message);
    else
        message = options?.message || statusCode.message || "";
    if (enhanced) {
        const esc = statusCode;
        return `${esc.code} ${esc.class}.${esc.subject}.${esc.detail} ${message}\r\n`;
    }
    return `${statusCode.code} ${message}\r\n`;
}
function replaceArgs(statusCode, args, msg) {
    if (!("message" in statusCode))
        return msg || "";
    let message = statusCode.message;
    for (let i = 0; message.includes("%"); i++) {
        message.replace("%", args[i] ?? msg);
    }
    return message;
}

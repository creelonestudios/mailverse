import net from "net";
import { createHash } from "node:crypto";
import User from "../models/User.js";
import Logger from "../Logger.js";
import getConfig from "../config.js";
const logger = new Logger("IMAP", "TEAL");
export default class IMAPServer {
    server;
    constructor(port) {
        this.server = net.createServer();
        this.server.listen(port, () => {
            logger.log("Server listening on port " + port);
        });
        this.server.on("connection", this.connection);
    }
    connection(sock) {
        logger.log("Client connected");
        sock.write("* OK IMAP4rev1 Service Ready\r\n");
        let user;
        sock.on("data", async (data) => {
            const msg = data.toString().trim();
            logger.log("Received data: " + msg);
            const tag = msg.split(" ")[0];
            const rest = msg.split(" ").slice(1).join(" ");
            const cmd = rest.split(" ")[0].toLowerCase();
            const args = (rest.match(/(".*?"|[^"\s]+)+(?=\s*|\s*$)/g) || []).filter(Boolean).splice(1);
            logger.debug("Tag: " + tag);
            logger.debug("Command: " + cmd);
            logger.debug("Arguments: " + args.join(" "));
            if (cmd === "login") {
                let username = args[0].trim().toLowerCase();
                if (username.includes("@")) {
                    if (!username.endsWith("@" + getConfig("host", "localhost"))) {
                        return void sock.write(tag + " NO Invalid username or password\r\n");
                    }
                    username = username.substring(0, username.lastIndexOf("@"));
                }
                if (username.startsWith("\"") && username.endsWith("\"")) {
                    username = username.substring(1, username.length - 1);
                }
                else if (username.includes("@")) {
                    return void sock.write(tag + " NO Invalid username or password\r\n");
                }
                let _user = await User.findOne({ where: { username: username } });
                if (!_user)
                    return void sock.write(tag + " NO Invalid username or password\r\n");
                user = _user;
                let password = args[1];
                const hash = createHash("sha256");
                hash.update(password);
                const hashedPassword = hash.digest("hex");
                if (user.password != hashedPassword) {
                    return void sock.write(tag + " NO Invalid username or password\r\n");
                }
                sock.write(tag + " OK Logged in\r\n");
            }
            else if (cmd === "select") {
                const mailbox = args[0];
                if (mailbox == "INBOX") {
                    sock.write("* 18 EXISTS\r\n");
                    sock.write("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n");
                    sock.write("* 2 RECENT\r\n");
                    sock.write("* OK [UNSEEN 1] Message 1 is the first unseen message\r\n");
                    sock.write("* OK [UIDVALIDITY 1] UIDs valid\r\n");
                    sock.write(tag + " OK [READ-WRITE] SELECT completed\r\n");
                }
                else {
                    sock.write(tag + " NO [NONEXISTENT] SELECT failed\r\n");
                }
            }
            else if (cmd === "fetch") {
                // fetch 1 body[...]
                const id = args[0]; // 1
                const body = args[1]; // body[...]
                const mails = await user.$get("mails");
                const mail = mails[parseInt(id) - 1];
                if (!mail)
                    return void sock.write(tag + " NO [NONEXISTENT] FETCH failed\r\n");
                if (body == "body[]") {
                    sock.write("* 1 FETCH (BODY[] {" + mail.content.length + "}\r\n");
                    sock.write(mail.content + ")\r\n");
                    sock.write(tag + " OK FETCH completed\r\n");
                }
            }
            else if (cmd === "logout") {
                sock.write("* BYE IMAP4rev1 Server logging out\r\n");
                sock.write(tag + " OK LOGOUT completed\r\n");
                sock.end();
            }
            else if (cmd === "capability") {
                sock.write("* CAPABILITY IMAP4rev1\r\n");
                sock.write(tag + " OK CAPABILITY completed\r\n");
            }
            else if (cmd === "list") {
                sock.write("* LIST (\\HasNoChildren) \"/\" \"INBOX\"\r\n");
                sock.write(tag + " OK LIST completed\r\n");
            }
            else if (cmd === "noop") {
                sock.write(tag + " OK NOOP completed\r\n");
            }
            else if (cmd === "uid") {
                sock.write(tag + " OK UID completed\r\n");
            }
        });
        sock.addListener("close", () => {
            logger.log("Client disconnected");
        });
    }
}

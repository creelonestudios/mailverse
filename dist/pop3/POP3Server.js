import net from "net";
import tls from "tls";
import User from "../models/User.js";
import { createHash } from "node:crypto";
import Logger from "../Logger.js";
import getConfig from "../config.js";
import { readFile } from "fs/promises";
const logger = new Logger("POP3", "YELLOW");
export default class POP3Server {
    server;
    useTLS;
    constructor(port, useTLS, key, cert) {
        this.useTLS = useTLS;
        if (useTLS && (!key || !cert))
            throw new Error("TLS key or certificate not provided");
        this.server = useTLS ? tls.createServer({
            key,
            cert,
        }, this.connection) : net.createServer();
        this.server.listen(port, () => {
            logger.log("Server listening on port " + port);
        });
        if (!useTLS)
            this.server.on("connection", this.connection);
    }
    connection(sock) {
        logger.log("Client connected");
        sock.write("+OK POP3 server ready\r\n");
        let username = "";
        let user;
        const markedForDeletion = [];
        sock.on("data", async (data) => {
            const msg = data.toString();
            logger.log("Received data: " + msg);
            const args = msg.split(" ").slice(1);
            if (msg.startsWith("CAPA")) { // list capabilities
                sock.write("+OK Capability list follows\r\nUSER\r\n.\r\n");
            }
            else if (msg.startsWith("USER")) { // client gives username
                if (args.length < 1)
                    return void sock.write("-ERR Invalid username or password\r\n");
                username = args[0].trim().toLowerCase();
                if (username.includes("@")) {
                    if (!username.endsWith("@" + getConfig("host", "localhost"))) {
                        return void sock.write("-ERR Invalid username or password\r\n");
                    }
                    username = username.substring(0, username.lastIndexOf("@"));
                }
                if (username.startsWith("\"") && username.endsWith("\"")) {
                    username = username.substring(1, username.length - 1);
                }
                else if (username.includes("@")) {
                    // this is not allowed
                    return void sock.write("-ERR Invalid username or password\r\n");
                }
                let _user = await User.findOne({ where: { username: username } });
                if (!_user)
                    return void sock.write("-ERR Invalid username or password\r\n");
                user = _user;
                sock.write("+OK\r\n");
            }
            else if (msg.startsWith("PASS")) { // client gives password
                if (args.length < 1)
                    return void sock.write("-ERR Invalid username or password\r\n");
                const password = args[0].trim();
                const hash = createHash("sha256");
                hash.update(password);
                const hashedPassword = hash.digest("hex");
                if (user.password == hashedPassword) {
                    sock.write("+OK Logged in\r\n");
                }
                else {
                    sock.write("-ERR Invalid username or password\r\n");
                }
            }
            else if (msg.startsWith("STAT")) { // get number of messages and total size
                const mails = await user.$count("mails");
                sock.write("+OK " + mails + "\r\n");
            }
            else if (msg.startsWith("QUIT")) {
                sock.write("+OK Bye\r\n");
                sock.end();
            }
            else if (msg.startsWith("LIST")) {
                const mails = await user.$get("mails");
                sock.write("+OK " + mails.length + " messages\r\n");
                for (let i = 0; i < mails.length; i++) {
                    sock.write(i + "\r\n");
                }
                sock.write(".\r\n");
            }
            else if (msg.startsWith("RETR")) {
                if (args.length < 1)
                    return void sock.write("-ERR No message specified\r\n");
                const mail = await user.getMail(parseInt(args[0].trim()));
                if (!mail)
                    return void sock.write("-ERR No such message\r\n");
                const content = await readFile("mails/" + mail.content + ".txt", "utf-8");
                sock.write("+OK\r\n" + content + "\r\n.\r\n");
            }
            else if (msg.startsWith("TOP")) {
                if (args.length < 2)
                    return void sock.write("-ERR No message specified\r\n");
                const mail = await user.getMail(parseInt(args[0].trim()));
                if (!mail)
                    return void sock.write("-ERR No such message\r\n");
                const content = await readFile("mails/" + mail.content + ".txt", "utf-8");
                const lines = content.split("\r\n");
                const top = lines.slice(0, 10).join("\r\n");
                sock.write("+OK\r\n" + top + "\r\n.\r\n");
            }
            else if (msg.startsWith("UIDL")) { // get unique id of message
                const mails = await user.$get("mails");
                for (let i = 0; i < mails.length; i++) {
                    sock.write(i + " " + mails[i].uuid + "\r\n");
                }
                sock.write(".\r\n");
            }
            else if (msg.startsWith("DELE")) {
                if (args.length < 1)
                    return void sock.write("-ERR No message specified\r\n");
                const mail = await user.getMail(parseInt(args[0].trim()));
                if (!mail)
                    return void sock.write("-ERR No such message\r\n");
                await mail.destroy();
                sock.write("+OK\r\n");
            }
            else if (msg.startsWith("NOOP")) { // this is used to keep the connection alive
                sock.write("+OK\r\n");
            }
            else if (msg.startsWith("RSET")) {
                for (const mail of markedForDeletion) {
                    await mail.restore();
                }
                sock.write("+OK\r\n");
            }
        });
        sock.addListener("close", () => {
            logger.log("Client disconnected");
        });
    }
}

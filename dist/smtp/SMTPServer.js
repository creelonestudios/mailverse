import net from "net";
import { writeFileSync, mkdirSync } from "fs";
import getConfig from "../config.js";
import User from "../models/User.js";
import { smtpserver } from "../main.js";
import crypto from "node:crypto";
import Logger from "../Logger.js";
const logger = new Logger("SMTP");
export default class SMTPServer {
    server;
    constructor(port) {
        this.server = net.createServer();
        this.server.listen(port, () => {
            logger.log(`Server listening on port ${port}`);
        });
        this.server.on("connection", this.connection);
    }
    connection(sock) {
        logger.log("Client connected");
        sock.write(`220  ${getConfig("smtp_header")}\r\n`);
        let receivingData = false;
        let info = {
            from: "",
            to: [],
            content: ""
        };
        sock.on("data", async (data) => {
            const msg = data.toString();
            // TODO implement regular HELO greeting
            if (receivingData) {
                logger.log(`Received message content: ${msg}`);
                info.content += msg;
                if (msg.endsWith(".\r\n")) {
                    receivingData = false;
                    info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n");
                    await smtpserver.handleNewMail(info);
                    sock.write("250 OK\r\n");
                    logger.log("No longer receiving data -----------------------------------");
                    return;
                }
                return;
            }
            logger.log(`Received data: ${msg}`);
            if (msg.startsWith("EHLO")) {
                sock.write("250-localhost\r\n");
                // We dont have any smtp extensions yet
                sock.write("250 HELP\r\n");
            }
            else if (msg.startsWith("MAIL FROM:")) {
                const email = msg.split(":")[1].split(">")[0].replace("<", "");
                logger.log(`MAIL FROM: ${email}`);
                info.from = email;
                sock.write("250 OK\r\n");
            }
            else if (msg.startsWith("RCPT TO:")) {
                const email = msg.split(":")[1].split(">")[0].replace("<", "");
                info.to.push(email);
                logger.log(`RCPT TO: ${email}`);
                sock.write("250 OK\r\n");
            }
            else if (msg.startsWith("DATA")) {
                receivingData = true;
                logger.log("Now receiving data -----------------------------------");
                sock.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
            }
            else if (msg.startsWith("QUIT")) {
                sock.write("221 Bye\r\n");
                sock.end();
            }
            else {
                sock.write("500 Command not implemented\r\n");
            }
        });
        sock.on("close", () => {
            logger.log("Client disconnected");
        });
    }
    async handleNewMail(info) {
        const id = crypto.randomUUID();
        mkdirSync(`mails/`, { recursive: true });
        writeFileSync(`mails/${id}.txt`, info.content);
        logger.log(`Saved mail to mails/${id}.txt`);
        const serverName = getConfig("host");
        if (info.from.endsWith("@" + serverName)) {
            logger.log("Mail is from this server.");
            if (info.to.every(email => email.endsWith("@" + serverName))) { // if all recipients are on this server
                logger.log("All recipients are on this server.");
                // TODO: add mail to mailboxes
                return;
            }
            logger.log("Not all recipients are on this server. Will forward mail to other servers.");
            logger.error("Forwarding mails to other servers is not implemented yet.");
            return;
        }
        // Mail is not from this server
        if (!info.to.every(email => email.endsWith("@" + serverName))) {
            logger.error("Not all recipients are from this server. Will NOT forward mail to other servers.");
        }
        const recipients = info.to.filter(email => email.endsWith("@" + serverName));
        for (const rec of recipients) {
            logger.log("Forwarding mail to " + rec);
            const user = await User.findOne({ where: { username: rec.split("@")[0] } });
            if (!user) {
                logger.error("User " + rec + " does not exist.");
                continue;
            }
            await user.$create("mail", {
                from: info.from,
                to: rec,
                content: id
            });
            logger.log("Forwarded mail to " + rec);
        }
    }
}

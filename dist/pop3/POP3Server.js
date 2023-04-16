import net from "net";
import { readdirSync, readFileSync } from "fs";
export default class POP3Server {
    server;
    constructor(port) {
        this.server = net.createServer();
        this.server.listen(port, () => {
            console.log("[POP3] Server listening on port " + port);
        });
        this.server.on("connection", this.connection);
    }
    connection(sock) {
        console.log("[POP3] Client connected");
        sock.write("+OK POP3 server ready\r\n");
        let username = "";
        let password = "";
        sock.on("data", async (data) => {
            const msg = data.toString();
            console.log("[POP3] Received data: " + msg);
            if (msg.startsWith("CAPA")) { // list capabilities
                sock.write("+OK Capability list follows\r\nUSER\r\n.\r\n");
            }
            else if (msg.startsWith("USER")) { // client gives username
                username = msg.split(" ")[1].trim();
                sock.write("+OK\r\n");
            }
            else if (msg.startsWith("PASS")) { // client gives password
                password = msg.split(" ")[1].trim();
                console.log(username, password);
                if (username == "test" && password == "test") {
                    sock.write("+OK Logged in\r\n");
                }
                else {
                    sock.write("-ERR Invalid username or password\r\n");
                }
            }
            else if (msg.startsWith("STAT")) { // get number of messages and total size
                sock.write("+OK 1 100\r\n");
            }
            else if (msg.startsWith("QUIT")) {
                sock.write("+OK Bye\r\n");
                sock.end();
            }
            else if (msg.startsWith("LIST")) {
                sock.write("+OK 1 100\r\n");
                sock.write("1 100\r\n");
                sock.write(".\r\n");
            }
            else if (msg.startsWith("RETR")) {
                const msg = readFileSync("mails/" + readdirSync("mails")[0], "utf-8");
                sock.write("+OK 100 octets\r\n" + msg + "\r\n.\r\n");
            }
            else if (msg.startsWith("UIDL")) { // get unique id of message
                sock.write("-ERR Not implemented\r\n");
            }
            else if (msg.startsWith("DELE")) {
                sock.write("+OK\r\n");
            }
        });
        sock.addListener("close", () => {
            console.log("[POP3] Client disconnected");
        });
    }
}

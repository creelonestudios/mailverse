/// <reference types="node" resolution-mode="require"/>
import net from "net";
export default class SMTPServer {
    server: net.Server;
    messages: Map<number, string>;
    constructor(port: number);
    connection(sock: net.Socket): void;
    handleNewMail(info: {
        from: string;
        to: string[];
        content: string;
    }): Promise<void>;
}

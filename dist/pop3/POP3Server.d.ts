/// <reference types="node" resolution-mode="require"/>
import net from "net";
export default class POP3Server {
    server: net.Server;
    constructor(port: number);
    connection(sock: net.Socket): void;
}

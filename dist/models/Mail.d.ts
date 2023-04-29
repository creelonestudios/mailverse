import { Model } from "sequelize-typescript";
import User from "./User.js";
export default class Mail extends Model {
    uuid: string;
    from: string;
    to: string;
    content: string;
    seen: boolean;
    userUuid: string;
    user: User;
}

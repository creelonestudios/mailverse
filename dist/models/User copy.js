var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { DataTypes } from "sequelize";
import { Column, HasMany, Model, NotNull, PrimaryKey, Table, Unique } from "sequelize-typescript";
let User = class User extends Model {
    name;
    email;
    password;
};
__decorate([
    Column(DataTypes.STRING),
    NotNull,
    Unique
], User.prototype, "name", void 0);
__decorate([
    Column(DataTypes.STRING),
    NotNull,
    Unique,
    PrimaryKey
], User.prototype, "email", void 0);
__decorate([
    NotNull,
    Column({
        type: DataTypes.STRING,
        set(value) {
            this.setDataValue("password", hashSync(String(value), 10));
        }
    })
], User.prototype, "password", void 0);
__decorate([
    HasMany(() => Mail)
], User.prototype, "mails", void 0);
User = __decorate([
    Table({
        paranoid: true,
        tableName: "users"
    })
], User);
export default User;

// @ts-ignore
import keyFile from "../../keys/embeddedKey.json" with { type: "file" }
import crypto from "node:crypto";

export class EmbeddedKeyManager {

  public static async loadKey(password: string) {
    let fileContent: string
    // @ts-ignore
    if (typeof Bun !== "undefined") {
      const {file} = await import("bun")
      fileContent = await file(keyFile).json()
    }else{
      fileContent = keyFile
    }


    const salt = "somerandomsalteja"
    const iterations = 100000
    const key_length = 32

    const key = crypto.pbkdf2Sync(password, salt, iterations, key_length, "sha512")
    try {
      const result = this._decrypt(fileContent, key)
      const jsonKey = JSON.parse(result)
      if ("type" in jsonKey) {
        return jsonKey
      }
    } catch (e) {
    }

    return  undefined
  }

  public static getIV() {
    return "befe91dcc480738f9ac44a971d2473a7"
  }

  public static _decrypt(text: string, key: Buffer) {
    const ivBuffer = Buffer.from(this.getIV(), "hex")
    const encryptedText = Buffer.from(text, 'hex');
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), ivBuffer);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
}
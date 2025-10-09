import * as admin from "firebase-admin";
import {EmbeddedKeyManager} from "@lib/EmbeddedKeyManager";

export const getFirebaseApp = () => {
  try {
    return  admin.app()
  } catch (e) {
    throw e
  }
}
import * as admin from "firebase-admin";
import serviceAccount from "../../keys/fb-keys.json";


export const getFirebaseApp = () => {
  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
    });
    return app
  } catch (e) {
    return admin.app()
  }
}
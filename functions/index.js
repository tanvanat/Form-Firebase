import { setGlobalOptions } from "firebase-functions/v2";

// Optional: keep this. Make sure it's declared only once.
setGlobalOptions({ maxInstances: 10 });

// Export your function(s)
export { syncResponsesToMySQL } from "./src/syncResponses.js";

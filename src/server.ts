import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Enhasa auth service listening on port ${env.port}`);
});

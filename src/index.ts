import { createApp } from "./http/app";
import { createRequestDependencies } from "./http/dependencies";

export type { Bindings } from "./http/types";

export default createApp(createRequestDependencies);

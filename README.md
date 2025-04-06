# `@david/service-store`

Lightweight dependency injection.

Goals:

1. No magic, static analysis, `reflect-metadata`, build step, or decorators
1. Child stores.
1. Type checking.
1. Simple.

Setup:

```
deno add jsr:@david/service-store
```

## Example

```ts
import { defineStore } from "@david/service-store";

// services here will be shared amongst the requests
const singletonStore = defineStore()
  .add("dbPool", async () => {
    return; /* ...create database pool here... */
  })
  .add("imageCache", () => {
    return; /* ...create image cache here... */
  })
  .finalize();

// now create a child definition off the singleton
// store that will be used per request
const requestScopedDef = singletonStore
  .createChild()
  .add("db", async (store) => {
    // grab an instance from the pool
    const pool = await store.get("dbPool");
    return pool.getItem();
  })
  .add("userService", async (store) => {
    return new UserService(
      await store.get("db"),
      store.get("imageCache"),
    );
  });

Deno.serve(async (req) => {
  // create the request specific store from the definition
  // and optionally use `await using` or `using` in order
  // to dispose any services in the store when the request
  // finishes
  await using store = requestScopedDef.finalize();
  // do whatever to handle the request using the store here
  return handleRequest(store, req);
});
```

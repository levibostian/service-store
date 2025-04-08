# `@david/service-store`

[![JSR](https://jsr.io/badges/@david/service-store)](https://jsr.io/@david/service-store)

Lightweight dependency injection.

Goals:

1. No magic, static analysis, `reflect-metadata`, build step, or decorators.
1. Child stores.
1. Type checking.

## Example

```ts
import { defineStore } from "@david/service-store";

const store = defineStore()
  .add("db", () => {
    return new Database();
  })
  .add("imageCache", (store) => {
    return new ImageCache(store.get("db"));
  })
  .add("userService", (store) => {
    return new UserService(
      store.get("imageCache"),
      store.get("db"),
    );
  })
  .finalize();

const userService = store.get("userService");
// use userService here...
```

## Child Stores Example

```ts
import { defineStore } from "@david/service-store";

// services here will be shared amongst the requests
const singletonStore = defineStore()
  .add("dbPool", () => {
    return new DatabasePool();
  })
  .add("imageCache", () => {
    return new ImageCache();
  })
  .finalize();

// now create a child definition off the singleton
// store that will be used per request
const requestScopedDef = singletonStore
  .createChild()
  .add("db", async (store) => {
    // grab an instance from the pool to be used for
    // the duration of the request
    const pool = store.get("dbPool");
    return await pool.getItem();
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

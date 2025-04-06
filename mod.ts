/** A store which contains memoized instances. */
export class Store<
  TFactories extends Record<string, (store: Store<TFactories>) => unknown>,
> implements Disposable, AsyncDisposable {
  readonly #memoizedValues: {
    [P in keyof TFactories]?: {
      promisify?: true;
      value: ReturnType<TFactories[P]>;
    };
  } = {};
  readonly #factories: TFactories;
  readonly #parent?: Store<{}>;

  /** @ignore */
  constructor(
    factories: TFactories,
    parent: Store<{}> | undefined,
  ) {
    this.#factories = factories;
    this.#parent = parent;
  }

  /**
   * Synchronously disposes all disposable services in the store.
   * 
   * @remarks This will error if any async disposable services are
   * in the store (unless they're also disposable).
   */
  [Symbol.dispose]() {
    for (const { value } of (Object.values(this.#memoizedValues) as any[])) {
      if (value[Symbol.dispose] instanceof Function) {
        value[Symbol.dispose]();
      } else if (value[Symbol.asyncDispose] instanceof Function) {
        throw new Error(
          "Cannot dispose a container containing async disposables. Use `await using` instead of `using`.",
        );
      }
    }
  }

  /**
   * Asynchronously disposes all disposable and async disposable services
   * in the store.
   */
  async [Symbol.asyncDispose]() {
    const pendingPromises = [];
    for (const { value } of (Object.values(this.#memoizedValues) as any[])) {
      // prefer async
      if (value[Symbol.asyncDispose] instanceof Function) {
        pendingPromises.push(value[Symbol.asyncDispose]());
      } else if (value[Symbol.dispose] instanceof Function) {
        value[Symbol.dispose]();
      }
    }
    await Promise.all(pendingPromises);
  }

  /** Gets if the store has a service with the provided name. */
  has<TName extends keyof TFactories>(name: TName): boolean {
    return name in this.#factories ||
      (this.#parent?.has(name as any as never) ?? false);
  }

  /**
   * Gets a service at the provided key.
   * 
   * @remarks Throws if the service is not in the store.
   */
  get<TName extends keyof TFactories>(
    name: TName,
  ): ReturnType<TFactories[TName]> {
    if (name in this.#memoizedValues) {
      const entry = this.#memoizedValues[name]!;
      if (entry.promisify) {
        return Promise.resolve(entry.value) as any;
      } else {
        return entry.value;
      }
    } else {
      const factory = this.#factories[name];
      if (factory == null) {
        if (this.#parent?.has(name as any as never)) {
          return this.#parent.get(name as any as never);
        } else {
          throw new Error(`Store did not contain key: ${name as any}`);
        }
      }
      const value = factory(this);
      if ((factory as any).transient) {
        return value as any;
      }
      if (value instanceof Promise) {
        value.then((value) => {
          this.#memoizedValues[name] = {
            promisify: true,
            value,
          };
        }).catch((_err) => {
          // remove the promise on error
          delete this.#memoizedValues[name];
        });
      }
      this.#memoizedValues[name] = {
        value: value as any,
      };
      return value as any;
    }
  }

  /**
   * Creates a child store definition from the current store.
   *
   * This is useful for sharing instances in the current store
   * with a child store definition which can then have multiple
   * stores created from it.
   * 
   * For example, say you're creating an http server. It can be
   * useful to have certain services alive for the duration of
   * the application and only certain services alive per request.
   * To achieve this, an application store can be made and from
   * that a child "request store definition" with its request-only
   * services. When a request comes in, a store can be created
   * specifically for that request.
   */
  createChild(): StoreDefinition<TFactories> {
    return new StoreDefinition({} as any, this);
  }
}

/** A definition of factory functions which can be used to create a store. */
export class StoreDefinition<
  TFactories extends Record<string, (store: Store<TFactories>) => unknown>,
> {
  readonly #factories: TFactories;
  readonly #parentStore: Store<{}> | undefined;

  /** @ignore */
  constructor(factories: TFactories, parentStore: Store<{}> | undefined) {
    if (arguments.length !== 2) {
      throw new Error("Use the `defineStore` export instead.");
    }
    this.#factories = factories;
    this.#parentStore = parentStore;
  }

  /** Adds a service factory to the store definition at the provided key. */
  add<TName extends string, TType>(
    name: TName,
    value: (services: Store<TFactories>) => TType,
  ): StoreDefinition<TFactories & { [P in TName]: () => TType }> {
    if (name in this.#factories || this.#parentStore?.has(name as never)) {
      throw new Error(`Service already defined: ${name}`);
    }
    return new StoreDefinition({
      ...this.#factories,
      [name]: value,
    }, this.#parentStore) as any;
  }

  /**
   * Adds a transient service to the store. These services will
   * be created each time they're requested instead of being
   * memoized.
   */
  addTransient<TName extends string, TType>(
    name: TName,
    value: (services: Store<TFactories>) => TType,
  ): StoreDefinition<TFactories & { [P in TName]: () => TType }> {
    (value as any).transient = true;
    return this.add(name, value);
  }

  /** Create the store. */
  finalize(): Store<TFactories> {
    return new Store(this.#factories, this.#parentStore);
  }
}

/**
 * Start for defining a store definition and eventually
 * creating a store.
 * 
 * ```ts
 * const storeDef = defineStore()
 *   .add("db", () => createDb())
 *   .add("userService", (store) => new UserService(store.get("db")));
 * const store = storeDef.finalize();
 * const userService = store.get("userService");
 * ```
 */
export function defineStore(): StoreDefinition<{}> {
  return new StoreDefinition({}, undefined);
}

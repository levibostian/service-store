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

  has<TName extends keyof TFactories>(name: TName): boolean {
    return name in this.#factories ||
      (this.#parent?.has(name as any as never) ?? false);
  }

  get<TName extends keyof TFactories>(
    name: TName,
  ): ReturnType<TFactories[TName]> {
    if (this.#parent?.has(name as any as never)) {
      return this.#parent.get(name as any as never);
    }
    if (name in this.#memoizedValues) {
      const entry = this.#memoizedValues[name]!;
      if (entry.promisify) {
        return Promise.resolve(entry.value) as any;
      } else {
        return entry.value;
      }
    } else {
      const factory = this.#factories[name];
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
        }).catch(_err => {
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

  createChild(): StoreDefinition<TFactories> {
    return new StoreDefinition({} as any, this);
  }
}

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

  add<TName extends string, TType>(
    name: TName,
    value: (services: Store<TFactories>) => TType,
  ): StoreDefinition<TFactories & { [P in TName]: () => TType }> {
    if (name in this.#factories) {
      throw new Error(`Service ${name} already registered.`);
    }
    return new StoreDefinition({
      ...this.#factories,
      [name]: value,
    }, this.#parentStore) as any;
  }

  addTransient<TName extends string, TType>(
    name: TName,
    value: (services: Store<TFactories>) => TType,
  ): StoreDefinition<TFactories & { [P in TName]: () => TType }> {
    (value as any).transient = true;
    return this.add(name, value);
  }

  finalize(): Store<TFactories> {
    return new Store(this.#factories, this.#parentStore);
  }
}

export function defineStore(): StoreDefinition<{}> {
  return new StoreDefinition({}, undefined);
}

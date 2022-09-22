import Schema from 'schemastery';
import { inject } from '../lib/ui';
import { ModuleInterfaces } from '../loader';
import * as bus from './bus';

export const runtimes: Record<string, Runtime> = Object.create(null);

function addScript<K>(name: string, description: string, validate: Schema<K>, run: (args: K, report: any) => boolean | Promise<boolean>) {
    if (global.Hydro.script[name]) throw new Error(`duplicate script ${name} registered.`);
    global.Hydro.script[name] = { description, validate, run };
    return () => delete global.Hydro.script[name];
}

function provideModule<T extends keyof ModuleInterfaces>(type: T, id: string, module: ModuleInterfaces[T]) {
    if (global.Hydro.module[type][id]) throw new Error(`duplicate script ${type}/${id} registered.`);
    global.Hydro.module[type as any][id] = module;
    return () => delete global.Hydro.module[type][id];
}

export interface Context {
    Route: typeof import('./server').Route;
    Connection: typeof import('./server').Connection;
    on: typeof bus['on'];
    once: typeof bus['once'];
    off: typeof bus['off'];
    addScript: typeof addScript;
    provideModule: typeof provideModule;
    inject: typeof inject;
}

export class Runtime {
    private disposables = [];
    public sideEffect = false;
    public loaded = false;

    constructor(public filename: string) {
        runtimes[filename] = this;
    }

    load(module: any) {
        if (this.loaded) throw new Error(`Module ${this.filename} was already loaded`);
        this.sideEffect = false;
        if (typeof module.dispose === 'function') this.disposables.push(module.dispose);
        const T = (origFunc, disposeFunc?) => (origFunc ? (...args) => {
            const res = origFunc(...args);
            this.disposables.push(disposeFunc ? () => disposeFunc(res) : res);
            return res;
        } : null);
        module.apply({
            Route: T(global.Hydro.service.server?.Route),
            Connection: T(global.Hydro.service.server?.Connection),
            on: T(bus.on),
            once: T(bus.once),
            off: bus.off,
            addScript: T(addScript),
            setInterval: T(setInterval, clearInterval),
            setTimeout: T(setTimeout, clearTimeout),
            setImmediate: T(setImmediate, clearImmediate),
            provideModule: T(provideModule),
            inject: T(inject),
        } as Context);
        if (module.sideEffect) this.sideEffect = true;
        this.loaded = true;
    }

    dispose() {
        this.disposables.map((i) => i());
        this.disposables = [];
        this.loaded = false;
    }
}

import { Typing } from "@saggitarius/typing";
import { IDirectory, Mode, Type } from "@saggitarius/filesystem";
import { Package, PackageRegistry } from "@saggitarius/package";
import { Path } from "@saggitarius/path";

interface PackageJson {
    name: string;
    version: string;
    main?: string;
    index?: string;
}

interface TSConfigJson {
    compilerOptions?: {
        outDir?: string;
        sourceRoot?: string;
    }
} 

@Typing.register("@saggitarius/package-scanner::PackageScanner")
export class PackageScanner {
    public constructor(
        private dir: IDirectory,
        private registry: PackageRegistry,
    ) {}

    public async scan(): Promise<void> {
        debugger;
        const waiters = [];
        for await (const path of this.dirs()) {
            const pkg: Partial<Package> = {};
            this.registry[path] = pkg as Package;
            waiters.push(
                this.readPackage(pkg, path),
                this.readTsConfig(pkg, path),
            );
        }

        await Promise.all(waiters);
    }

    private async readPackage(pkg: Partial<Package>, path: string): Promise<void> {
        try {
            const config = await this.readFile<PackageJson>(Path.join(path, "package.json"));
            pkg.name = config.name;
            pkg.version = config.version;
            pkg.main = config.main || config.index;
            pkg.path = path;
            this.registry[config.name] = pkg as Package;
        } catch (err) {

        }
    }

    private async readTsConfig(pkg: Partial<Package>, path: string): Promise<void> {
        try {
            const config = await this.readFile<TSConfigJson>(Path.join(path, "tsconfig.json"));
            if (config.compilerOptions) {
                pkg.distDir = config.compilerOptions.outDir;
                pkg.srcDir = config.compilerOptions.sourceRoot;
            }
        } catch (err) {

        }
    }

    private async readFile<T>(path: string): Promise<T> {
        const file = await this.dir.file(path, Mode.Read);
        const content = await file.read();
        file.close();
        return JSON.parse(content.toString("utf-8"));
    }

    private async *dirs(): AsyncIterable<string> {
        const dirs: Array<IDirectory> = [this.dir];
        while (dirs.length) {
            const dir = dirs.shift();
            const relDir = Path.relative(this.dir.path, dir.path);
            const isDependency = relDir.includes("node_modules");
            for await (const [type, elem] of dir.list()) {
                if (type === Type.File && elem === "package.json") {
                    yield relDir;
                } else if (type === Type.Directory && (
                    elem !== "node_modules" || !isDependency
                )) {
                    const child = await dir.directory(elem);
                    if (child.readable && child.listable) {
                        dirs.push(child);
                    }
                }

            }
        }
    }
}

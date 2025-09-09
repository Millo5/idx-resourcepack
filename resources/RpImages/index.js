import fs from 'fs';
import path from 'path';

const PACK_ROOT = "../..";
const NAMESPACE = "rpimages";
const READ_FOLDER = "./images";
const FORCE_OVERWRITE = false;

const KEY_INFO = "./key_info.json";


const TEXTURES_DIR = path.join(PACK_ROOT, "assets", NAMESPACE, "textures", "custom", "items");
const ITEM_MODELS_DIR = path.join(PACK_ROOT, "assets", "minecraft", "models", "item");
const MODELS_DIR = path.join(PACK_ROOT, "assets", NAMESPACE, "models", "custom", "items");



if (FORCE_OVERWRITE) {
    console.log("\n[!] Force mode enabled. Previous modeldata will not be kept.\n");
}

if (!fs.existsSync(PACK_ROOT)) {
    throw new Error(`Pack root directory does not exist: ${PACK_ROOT}`);
} else console.log("[+] Pack Root Found")


//


class Model {
    static from(texture) {
        return {
            "parent":`minecraft:item/generated`,
            "textures":{
                "layer0": `${texture}`,
            }
        }
    }
}

class FileManager {

    static readJsonFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    static writeJsonFile(filePath, data) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
    }

    static getFilesInDirectory(directory) {
        if (!fs.existsSync(directory)) {
            throw new Error(`Directory does not exist: ${directory}`);
        }
        return fs.readdirSync(directory)
            .filter(file => fs.statSync(path.join(directory, file)).isFile());
    }

    static getFolderNamesInDirectory(directory) {
        if (!fs.existsSync(directory)) {
            throw new Error(`Directory does not exist: ${directory}`);
        }
        return fs.readdirSync(directory)
            .filter(file => fs.statSync(path.join(directory, file)).isDirectory());
    }

}


class ImageProcessor {
    constructor() {
        this.groups = {}
        this.keyInfo = {};
    }

    execute() {
        this.loadImageInfo();
        this.saveGroups();
        this.saveKeyInfo();
    }

    loadImageInfo() {
        let folders = FileManager.getFolderNamesInDirectory(READ_FOLDER);
        for (let folder of folders) {
            let folderPath = path.join(READ_FOLDER, folder);
            let files = FileManager.getFilesInDirectory(folderPath);
            if (files.length === 0) continue;

            this.groups[folder] = {
                "name": folder,
                "resourceNames": [], // All resources including vanilla textures
                "textures": {},      // Texture names without folder prefix
                "models": {}         // Model file content for each texture
            };

            // meta.json contains the item material and optional vanilla textures to include
            // {"item":"stone","vanilla":["item/coal"]}
            // meta is required for the item. vanilla textures are optional.

            let metaFilePath = path.join(folderPath, "meta.json");
            if (fs.existsSync(metaFilePath)) {
                let meta = FileManager.readJsonFile(metaFilePath);
                this.groups[folder].meta = meta;
                this.groups[folder].item = meta.item;
                if (!this.groups[folder].item) {
                    console.warn(`No item defined in meta for folder ${folder}: ${metaFilePath}`);
                    delete this.groups[folder];
                    continue;
                }
                if (meta.vanilla) {
                    for (let vanillaTexture of meta.vanilla) {
                        this.groups[folder].resourceNames.push(vanillaTexture);
                    }
                }
            } else {
                console.warn(`Meta file not found for folder ${folder}: ${metaFilePath}`);
                delete this.groups[folder];
                continue;
            }


            for (let file of files) {
                let fileName = path.basename(file, path.extname(file));
                let textureName = `${folder}/${fileName}`;
                let resourceName = `${NAMESPACE}:custom/items/${textureName}`;
                
                if (fileName === "meta") continue;

                this.groups[folder].textures[fileName] = textureName;
                this.groups[folder].models[fileName] = Model.from(resourceName);
                this.groups[folder].resourceNames.push(resourceName);
            }
        }
    }

    saveGroups() {
        for (this.groupName in this.groups) {
            this.saveGroup(this.groupName, this.groups[this.groupName]);
        }
    }

    saveGroup(groupName, group) {
        console.log(`\n[+] Saving group: ${groupName}`);
        
        this.keyInfo[groupName] = { "item": group.item };
        const itemModelPath = path.join(ITEM_MODELS_DIR, `${group.item}.json`);

        console.log(` - Item: ${group.item} -> ${itemModelPath}`);

        let result = {}
        if (fs.existsSync(itemModelPath) && !FORCE_OVERWRITE) {
            result = FileManager.readJsonFile(itemModelPath);
        } else {
            result = {
                "parent": "item/generated",
                "textures": {
                    "layer0": `minecraft:item/${group.item}`
                },
                "overrides": [],
                "rpimages": {}
            }
        }

        if (!result.rpimages) result.rpimages = {};

        const toBeUpdated = [];
        for (let resourceName of group.resourceNames) {
            if (!result.rpimages[resourceName]) {
                toBeUpdated.push(resourceName);
            }
        }
        
        toBeUpdated.forEach(resourceName => {
            var modeldata = 1;
            while (true) {
                var exists = false;
                for (let existingResourceName in result.rpimages) {
                    if (result.rpimages[existingResourceName] === modeldata) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) break;
                modeldata++;
            }

            result.rpimages[resourceName] = modeldata;

            result.overrides.push({
                "predicate": {
                    "custom_model_data": modeldata
                },
                "model": resourceName
            });
        });

        if (toBeUpdated.length > 0) {
            FileManager.writeJsonFile(itemModelPath, result);
            console.log(` - Updated item model: ${itemModelPath}`);
        }

        // move all images to textures folder, always overwriting
        const textureFolder = path.join(TEXTURES_DIR, groupName);
        if (!fs.existsSync(textureFolder)) {
            fs.mkdirSync(textureFolder, { recursive: true });
        }
        for (let fileName in group.textures) {
            const texturePath = path.join(textureFolder, `${fileName}.png`);
            const sourcePath = path.join(READ_FOLDER, groupName, fileName + ".png");
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, texturePath);
                console.log(` - Copied texture: ${texturePath}`);
            } else {
                console.warn(`Texture not found: ${sourcePath}`);
            }
        }

        // save models to models/custom folder, always overwriting
        const modelFolder = path.join(MODELS_DIR, groupName);
        if (!fs.existsSync(modelFolder)) {
            fs.mkdirSync(modelFolder, { recursive: true });
        }
        for (let fileName in group.models) {
            const modelPath = path.join(modelFolder, `${fileName}.json`);
            FileManager.writeJsonFile(modelPath, group.models[fileName]);
            console.log(` - Saved model: ${modelPath}`);
        }

        // Save key info for this group
        group.resourceNames.forEach(resourceName => {
            const name = resourceName.split("/").pop();
            this.keyInfo[groupName][name] = result.rpimages[resourceName];
        })
    }

    saveKeyInfo() {
        /*
        "groupName": {
            "resourceName": modeldata,
            "resourceName2": modeldata2,
            ...
        }
        */
        FileManager.writeJsonFile(KEY_INFO, this.keyInfo);
        console.log(`\n[+] Key info saved to: ${KEY_INFO}`);
    }

}

const imageProcessor = new ImageProcessor();
imageProcessor.execute();


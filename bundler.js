const fs = require('fs');
const babylon = require('babylon');
const path = require('path');
const traverse = require('babel-traverse').default;
const babel = require('babel-core'); 

let ID  = 0;

function createAsset(fileName) {
    const content = fs.readFileSync(fileName, 'utf-8');
    
    const ast = babylon.parse(content, {
        sourceType: 'module',  
    });
    
    let dependencies = [];
    
    traverse(ast, {
        ImportDeclaration: ({node}) => {
            dependencies.push(node.source.value)
        }
    })
    
    const id = ID++;
    
    const {code} = babel.transformFromAst(
        ast,
        null,
        {
            presets: ['env'],
        }
    )
    
    return {
        id,
        fileName,
        dependencies,
        code
    }
}

function createGraph(entry) {
    const mainAsset = createAsset(entry);
    let queue = [mainAsset];
    
    for (let asset of queue) {
        let dirName = path.dirname(asset.fileName);
        
        asset.mapping = {};
        
        asset.dependencies.forEach(relativePath => {
            const absolutePath = path.join(dirName, relativePath);
            const child = createAsset(absolutePath);
            
            asset.mapping[relativePath] = child.id;
            queue.push(child);
        })
    }
    
    return queue;
}

function bundle(graph) {
    let modules = '';
    
    graph.forEach(mod => {
        // here code is wrapped in a function
        // so the file variable should remain in the stric scope
        // of a single file
        modules += `${mod.id} : [
            function (require, module, exports) {
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)},
        ],`;
        
    });
    
    let result = `
        (function(modules) {
            function require(id) {
                const [fn, mapping] = modules[id];
                
                function localRequire(relativePath) {
                    return require(mapping[relativePath]);
                }
                
                const module = { exports: {} };
                
                fn(localRequire, module, module.exports);
                
                return module.exports;
            }
            
            require(0);
        })({${modules }})
    `;
    
    return result;
}

const graph = createGraph('./example/entry.js')
const result = bundle(graph);

console.log(result);

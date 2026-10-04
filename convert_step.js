const fs = require('fs');
const path = require('path');
const occtimportjs = require('occt-import-js');

async function convertStepToObj() {
    console.log('Loading OpenCASCADE WASM module...');
    const occt = await occtimportjs();
    
    const stepPath = 'C:\\Users\\carvi\\Downloads\\Space Day.step';
    console.log('Reading STEP file from:', stepPath);
    const fileBuffer = fs.readFileSync(stepPath);
    
    console.log('Parsing STEP file & tessellating CAD geometry...');
    const result = occt.ReadStepFile(fileBuffer, null);
    
    if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
        console.error('Failed to parse STEP file:', result);
        process.exit(1);
    }
    
    console.log(`Successfully converted STEP file! Generated ${result.meshes.length} 3D sub-meshes.`);
    
    // Convert extracted OpenCASCADE meshes into OBJ format
    let objContent = `# Space Day CAD Model converted from STEP\n`;
    let vertexOffset = 1;
    let normalOffset = 1;
    
    result.meshes.forEach((mesh, meshIdx) => {
        objContent += `g Mesh_${meshIdx}\n`;
        objContent += `o Object_${meshIdx}\n`;
        
        // Vertices (positions are in float array [x1, y1, z1, x2, y2, z2...])
        const pos = mesh.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
            objContent += `v ${pos[i]} ${pos[i+1]} ${pos[i+2]}\n`;
        }
        
        // Normals (if available)
        let hasNormals = false;
        if (mesh.attributes.normal && mesh.attributes.normal.array) {
            hasNormals = true;
            const norm = mesh.attributes.normal.array;
            for (let i = 0; i < norm.length; i += 3) {
                objContent += `vn ${norm[i]} ${norm[i+1]} ${norm[i+2]}\n`;
            }
        }
        
        // Faces (indices are 0-indexed uints)
        const indices = mesh.index.array;
        for (let i = 0; i < indices.length; i += 3) {
            const idx1 = indices[i] + vertexOffset;
            const idx2 = indices[i+1] + vertexOffset;
            const idx3 = indices[i+2] + vertexOffset;
            
            if (hasNormals) {
                const n1 = indices[i] + normalOffset;
                const n2 = indices[i+1] + normalOffset;
                const n3 = indices[i+2] + normalOffset;
                objContent += `f ${idx1}//${n1} ${idx2}//${n2} ${idx3}//${n3}\n`;
            } else {
                objContent += `f ${idx1} ${idx2} ${idx3}\n`;
            }
        }
        
        vertexOffset += pos.length / 3;
        if (hasNormals) normalOffset += mesh.attributes.normal.array.length / 3;
    });
    
    const outputDir = path.join(__dirname, 'public', 'models');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const objPath = path.join(outputDir, 'space_day.obj');
    fs.writeFileSync(objPath, objContent);
    console.log(`Saved converted 3D model to ${objPath} (${(fs.statSync(objPath).size / 1024).toFixed(1)} KB)`);
    
    // Also save raw JSON mesh representation for fast client-side loading
    const jsonPath = path.join(outputDir, 'space_day.json');
    const jsonMeshes = result.meshes.map(m => ({
        name: m.name || 'CAD_Part',
        color: m.color || [0.15, 0.45, 0.85],
        positions: Array.from(m.attributes.position.array),
        normals: m.attributes.normal ? Array.from(m.attributes.normal.array) : null,
        indices: Array.from(m.index.array)
    }));
    fs.writeFileSync(jsonPath, JSON.stringify(jsonMeshes));
    console.log(`Saved JSON mesh representation to ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);
}

convertStepToObj().catch(err => {
    console.error('Conversion error:', err);
});

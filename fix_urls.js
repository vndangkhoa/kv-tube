const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Use simple find approach for ts/tsx files
const execSync = require('child_process').execSync;
const files = execSync('find frontend -type f -name "*.ts" -o -name "*.tsx"').toString().trim().split('\n');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    // Revert the bad perl replacement
    content = content.replace(/\$\{process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/127\.0\.0\.1:8080'\}/g, 'http://127.0.0.1:8080');
    
    // Apply proper replacement: 
    // const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';
    // fetch(`http://127.0.0.1:8080...`) -> fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}...`)
    
    // Actually, only fetch calls need the environment var, but we can just replace 'http://127.0.0.1:8080'
    // with API_BASE if we import or define API_BASE. Since it's easier, let's just replace the raw literal string.
    
    content = content.replace(/'http:\/\/127\.0\.0\.1:8080/g, '`${process.env.NEXT_PUBLIC_API_URL || \'http://127.0.0.1:8080\'}');
    content = content.replace(/"http:\/\/127\.0\.0\.1:8080/g, '`${process.env.NEXT_PUBLIC_API_URL || \'http://127.0.0.1:8080\'}');
    content = content.replace(/`http:\/\/127\.0\.0\.1:8080/g, '`${process.env.NEXT_PUBLIC_API_URL || \'http://127.0.0.1:8080\'}');
    
    // We have to be careful not to double replace. The above will turn 'http://127.0.0.1:8080/api...' into 
    // `${process.env...}/api...`
    
    // Let's actually just revert the breaking perl replace first:
    // It looks like: process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}'
    
    fs.writeFileSync(file, content);
});
console.log("Done");

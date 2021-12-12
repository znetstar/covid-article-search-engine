import {
    initControl
} from './control';


process.stdin.resume();

initControl().catch((err) => {
    console.error(err.stack);
    process.exit(1);
})
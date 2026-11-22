import { validateGcodeJob } from './validation';
export type Tool = 'repeater' | 'converter' | 'twoAxis';
export const tools: {
    id: Tool;
    name: string;
}[] = [{ id: 'repeater', name: 'Pattern Repeater' }, { id: 'converter', name: 'Hexagonal Flat Converter' }, { id: 'twoAxis', name: 'Two Axis Converter' }];
export const samples: Record<Tool, string> = { repeater: `% 0 Holes
% 10.8 Width
% Spindle Start Stop

% Drilling:
% 10000 feedRate, 4 Z Movement, 0 Curve
% Engraving:
% Cyan 1: 500 feedRate, 4 Z Move,� 0 Curve

G1 F10000
M3

F10000
Z0
X5.400000 Y1.500000
F1500

Z4 X5.400000 Y1.500000
Z4 X5.289498 Y1.330155
Z4 X5.173894 Y1.164085
Z4 X5.053302 Y1.001904
Z4 X4.927834 Y0.843726
Z4 X4.797601 Y0.689665
Z4 X4.662718 Y0.539833
Z4 X4.523296 Y0.394344
Z4 X4.379448 Y0.253312
Z4 X4.231286 Y0.116851
Z4 X4.078922 Y-0.014926
Z4 X3.922470 Y-0.141905
Z4 X3.762041 Y-0.263973
Z4 X3.597748 Y-0.381017
Z4 X3.429704 Y-0.492922
Z4 X3.258020 Y-0.599575
Z4 X3.082810 Y-0.700863
Z4 X2.904186 Y-0.796671
Z4 X2.722261 Y-0.886887
Z4 X2.537147 Y-0.971397
Z4 X2.348955 Y-1.050088
Z4 X2.157800 Y-1.122844
Z4 X1.963793 Y-1.189554
Z4 X1.767046 Y-1.250104
Z4 X1.567673 Y-1.304380
Z4 X1.365786 Y-1.352268
Z4 X1.161497 Y-1.393655
Z4 X0.954918 Y-1.428427
Z4 X0.746163 Y-1.456471
Z4 X0.535343 Y-1.477673
Z4 X0.322571 Y-1.491920
Z4 X0.107960 Y-1.499097
Z4 X-0.107960 Y-1.499097
Z4 X-0.322571 Y-1.491920
Z4 X-0.535343 Y-1.477673
Z4 X-0.746163 Y-1.456471
Z4 X-0.954918 Y-1.428427
Z4 X-1.161497 Y-1.393655
Z4 X-1.365786 Y-1.352268
Z4 X-1.567673 Y-1.304380
Z4 X-1.767046 Y-1.250104
Z4 X-1.963793 Y-1.189554
Z4 X-2.157800 Y-1.122844
Z4 X-2.348955 Y-1.050088
Z4 X-2.537147 Y-0.971397
Z4 X-2.722261 Y-0.886887
Z4 X-2.904186 Y-0.796671
Z4 X-3.082810 Y-0.700863
Z4 X-3.258020 Y-0.599575
Z4 X-3.429704 Y-0.492922
Z4 X-3.597748 Y-0.381017
Z4 X-3.762041 Y-0.263973
Z4 X-3.922470 Y-0.141905
Z4 X-4.078922 Y-0.014926
Z4 X-4.231286 Y0.116851
Z4 X-4.379448 Y0.253312
Z4 X-4.523296 Y0.394344
Z4 X-4.662718 Y0.539833
Z4 X-4.797601 Y0.689665
Z4 X-4.927834 Y0.843726
Z4 X-5.053302 Y1.001904
Z4 X-5.173894 Y1.164085
Z4 X-5.289498 Y1.330155
Z4 X-5.400000 Y1.500000

X0
M5
M30`, converter: `% 14 Holes 
% 28.9777 Width 
% Spindle Start Stop 

% Drilling: 
% 10000 feedRate, 4 Z Movement, 0 Curve 
% Engraving: 


G1 F10000
M3


Z0
X13.738900 Y0.016700
Z4.000000
Z0
X11.711900 Y0.787700
Z4.000000
Z0
X9.641500 Y1.433200
Z4.000000
Z0
X7.535700 Y1.951600
Z4.000000
Z0
X5.402300 Y2.341000
Z4.000000
Z0
X3.249100 Y2.600200
Z4.000000
Z0
X1.084300 Y2.729300
Z4.000000
Z0
X-1.084400 Y2.729400
Z4.000000
Z0
X-3.249200 Y2.600200
Z4.000000
Z0
X-5.402400 Y2.341100
Z4.000000
Z0
X-7.535800 Y1.951700
Z4.000000
Z0
X-9.641600 Y1.433300
Z4.000000
Z0
X-11.711900 Y0.787700
Z4.000000
Z0
X-13.738800 Y0.016800
Z4.000000

Z0
X0

M5
M30`, twoAxis: `% 0 Holes 
% 4 Width 
% Spindle Start Stop 

% Drilling: 
% 10000 feedRate, 4 Z Movement, 0 Curve 
% Engraving: 
% Cyan 1: 1500 feedRate, 4 Z Move,  0 Curve 

G1 F10000
M3

F10000
Z0
X0.000000 Y2.000000
F1500

Z4 X0.000000 Y2.000000
Z4 X0.103710 Y1.997356
Z4 X0.206048 Y1.989510
Z4 X0.306886 Y1.976591
Z4 X0.406095 Y1.958728
Z4 X0.503547 Y1.936049
Z4 X0.599111 Y1.908684
Z4 X0.692661 Y1.876760
Z4 X0.784066 Y1.840407
Z4 X0.873199 Y1.799753
Z4 X0.959930 Y1.754927
Z4 X1.044131 Y1.706059
Z4 X1.125673 Y1.653275
Z4 X1.204427 Y1.596707
Z4 X1.280264 Y1.536481
Z4 X1.353056 Y1.472727
Z4 X1.422674 Y1.405574
Z4 X1.488990 Y1.335151
Z4 X1.551873 Y1.261585
Z4 X1.611197 Y1.185006
Z4 X1.666831 Y1.105543
Z4 X1.718648 Y1.023325
Z4 X1.766518 Y0.938479
Z4 X1.810313 Y0.851136
Z4 X1.849903 Y0.761423
Z4 X1.885161 Y0.669470
Z4 X1.915957 Y0.575404
Z4 X1.942164 Y0.479356
Z4 X1.963651 Y0.381453
Z4 X1.980290 Y0.281825
Z4 X1.991953 Y0.180599
Z4 X1.998510 Y0.077906
Z4 X1.999834 Y-0.026049
Z4 X1.995877 Y-0.129428
Z4 X1.986751 Y-0.231403
Z4 X1.972584 Y-0.331846
Z4 X1.953505 Y-0.430628
Z4 X1.929642 Y-0.527620
Z4 X1.901125 Y-0.622693
Z4 X1.868082 Y-0.715718
Z4 X1.830641 Y-0.806568
Z4 X1.788933 Y-0.895112
Z4 X1.743084 Y-0.981222
Z4 X1.693225 Y-1.064771
Z4 X1.639483 Y-1.145627
Z4 X1.581988 Y-1.223664
Z4 X1.520868 Y-1.298753
Z4 X1.456253 Y-1.370763
Z4 X1.388270 Y-1.439568
Z4 X1.317049 Y-1.505037
Z4 X1.242718 Y-1.567043
Z4 X1.165406 Y-1.625456
Z4 X1.085242 Y-1.680148
Z4 X1.002355 Y-1.730990
Z4 X0.916873 Y-1.777854
Z4 X0.828925 Y-1.820609
Z4 X0.738640 Y-1.859129
Z4 X0.646146 Y-1.893284
Z4 X0.551573 Y-1.922944
Z4 X0.455049 Y-1.947983
Z4 X0.356703 Y-1.968270
Z4 X0.256663 Y-1.983677
Z4 X0.155059 Y-1.994075
Z4 X0.052018 Y-1.999336
Z4 X-0.052018 Y-1.999336
Z4 X-0.155059 Y-1.994075
Z4 X-0.256663 Y-1.983677
Z4 X-0.356703 Y-1.968270
Z4 X-0.455049 Y-1.947983
Z4 X-0.551573 Y-1.922944
Z4 X-0.646146 Y-1.893284
Z4 X-0.738640 Y-1.859129
Z4 X-0.828925 Y-1.820609
Z4 X-0.916873 Y-1.777854
Z4 X-1.002355 Y-1.730990
Z4 X-1.085242 Y-1.680148
Z4 X-1.165406 Y-1.625456
Z4 X-1.242718 Y-1.567043
Z4 X-1.317049 Y-1.505037
Z4 X-1.388270 Y-1.439568
Z4 X-1.456253 Y-1.370763
Z4 X-1.520868 Y-1.298753
Z4 X-1.581988 Y-1.223664
Z4 X-1.639483 Y-1.145627
Z4 X-1.693225 Y-1.064771
Z4 X-1.743084 Y-0.981222
Z4 X-1.788933 Y-0.895112
Z4 X-1.830641 Y-0.806568
Z4 X-1.868082 Y-0.715718
Z4 X-1.901125 Y-0.622693
Z4 X-1.929642 Y-0.527620
Z4 X-1.953505 Y-0.430628
Z4 X-1.972584 Y-0.331846
Z4 X-1.986751 Y-0.231403
Z4 X-1.995877 Y-0.129428
Z4 X-1.999834 Y-0.026049
Z4 X-1.998510 Y0.077906
Z4 X-1.991953 Y0.180599
Z4 X-1.980290 Y0.281825
Z4 X-1.963651 Y0.381453
Z4 X-1.942164 Y0.479356
Z4 X-1.915957 Y0.575404
Z4 X-1.885161 Y0.669470
Z4 X-1.849903 Y0.761423
Z4 X-1.810313 Y0.851136
Z4 X-1.766518 Y0.938479
Z4 X-1.718648 Y1.023325
Z4 X-1.666831 Y1.105543
Z4 X-1.611197 Y1.185006
Z4 X-1.551873 Y1.261585
Z4 X-1.488990 Y1.335151
Z4 X-1.422674 Y1.405574
Z4 X-1.353056 Y1.472727
Z4 X-1.280264 Y1.536481
Z4 X-1.204427 Y1.596707
Z4 X-1.125673 Y1.653275
Z4 X-1.044131 Y1.706059
Z4 X-0.959930 Y1.754927
Z4 X-0.873199 Y1.799753
Z4 X-0.784066 Y1.840407
Z4 X-0.692661 Y1.876760
Z4 X-0.599111 Y1.908684
Z4 X-0.503547 Y1.936049
Z4 X-0.406095 Y1.958728
Z4 X-0.306886 Y1.976591
Z4 X-0.206048 Y1.989510
Z4 X-0.103710 Y1.997356
Z4 X0.000000 Y2.000000

Z0
X0

M5
M30` };
export type Settings = {
    repetitions: string;
    spacing: string;
    rotation: string;
    rapid: string;
    engraving: string;
    units: 'mm' | 'in';
};
export const defaults: Settings = { repetitions: '2', spacing: '5.715', rotation: '8.16', rapid: '10000', engraving: '1500', units: 'mm' };
const extractSections = (lines: string[]) => {
    const header: string[] = [];
    const pattern: string[] = [];
    const footer: string[] = [];
    let inPattern = false;
    let inFooter = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'M5' || trimmed === 'M30' || (trimmed.startsWith('X') && trimmed.includes('0') && !trimmed.includes('Y'))) {
            inFooter = true;
        }
        if (!inPattern && !inFooter && (trimmed.startsWith('%') || trimmed.startsWith('G1') || trimmed.startsWith('M3') || trimmed === '')) {
            header.push(line);
            if (trimmed.startsWith('M3'))
                inPattern = true;
        }
        else if (inFooter) {
            footer.push(line);
        }
        else if (inPattern && !inFooter) {
            if (trimmed.startsWith('Z4') && trimmed.includes('X') && trimmed.includes('Y')) {
                pattern.push(trimmed);
            }
        }
    }
    return { header, pattern, footer };
};
const transformPattern = (pattern: string[]): string[] => {
    return pattern.map(line => {
        const match = line.match(/Z4 X([-\d.]+) Y([-\d.]+)/);
        if (match) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            const newZ = y.toFixed(6);
            const newX = (-x).toFixed(6);
            const newY = x.toFixed(6);
            return `Z${newZ} X${newX} Y${newY}`;
        }
        return line;
    });
};
export function generate(tool: Tool, source: string, settings: Settings): string {
    const sourceProgram = source.trim() ? source : samples[tool];
    const { repetitions, spacing: yDistance, rotation: bIncrement, rapid: rapidFeedrate, engraving: engravingFeedrate } = settings;
    const repeatCount = repetitions;
    if (tool === 'repeater') {
        const reps = validateGcodeJob(sourceProgram, repetitions, [yDistance]);
        const yDist = Number(yDistance);
        const lines = sourceProgram.split('\n').map(line => line.trim()).filter(line => line);
        const { header, pattern, footer } = extractSections(lines);
        if (pattern.length === 0) {
            throw new Error("No pattern found. Ensure some lines start with 'Z4' and contain X/Y coordinates.");
        }
        const transformedPattern = transformPattern(pattern);
        const result: string[] = [];
        result.push(...header.filter(line => line.startsWith('%') || line.startsWith('G1') || line.startsWith('M3')), '');
        for (let i = 0; i < reps; i++) {
            const offset = i * yDist;
            result.push(`; --- Repetition ${i + 1} (Y-offset: ${offset.toFixed(6)}) ---`);
            if (i === 0) {
                result.push('F10000');
                result.push('Z-4');
                result.push('Z-4.000000 X0.000000 Y0.000000');
                result.push('F1500');
                result.push(...transformedPattern);
            }
            else {
                result.push('F10000');
                result.push('Z-4');
                const baseY = 6.000000;
                result.push(`X-6.000000 Y${(baseY + offset).toFixed(6)}`);
                result.push('F1500');
                transformedPattern.forEach(line => {
                    const match = line.match(/(Z[-\d.]+)\s*(X[-\d.]+)\s*(Y[-\d.]+)/);
                    if (match) {
                        const z = match[1];
                        const x = match[2];
                        const y = parseFloat(match[3].substring(1));
                        const newY = (y + offset).toFixed(6);
                        result.push(`${z} ${x} Y${newY}`);
                    }
                });
            }
            result.push('Z-4');
            if (i < reps - 1)
                result.push('');
        }
        result.push('', ...footer);
        return result.join('\n');
    }
    if (tool === 'converter') {
        const reps = validateGcodeJob(sourceProgram, repetitions, [yDistance]);
        const yStep = Number(yDistance);
        let processedCode = sourceProgram;
        // Rule: Delete all 'Z0' lines
        processedCode = processedCode
            .split('\n')
            .filter(line => line.trim() !== 'Z0')
            .join('\n');
        // Rule 1: Add the last known Y value to any Z4 line
        let lines = processedCode.split('\n');
        let lastY = 0;
        const tempLines1 = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Regex to find Y coordinate and its value
            const yMatch = trimmedLine.match(/Y(-?\d+(\.\d+)?)/);
            if (yMatch) {
                lastY = parseFloat(yMatch[1]);
            }
            // If line is Z4..., add lastY to it.
            if (/^Z4(?:\.0+)?(?=\s|[A-Z]|$)/.test(trimmedLine)) {
                const newZ = 4 + lastY;
                tempLines1.push(`Z${newZ.toFixed(6)}`);
            }
            else {
                tempLines1.push(line);
            }
        }
        processedCode = tempLines1.join('\n');
        // Rule 2: Exchange the values of X and Y
        lines = processedCode.split('\n');
        const tempLines2 = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Regex to find X and Y coordinates and their values
            const xMatch = trimmedLine.match(/X(-?\d+(\.\d+)?)/);
            const yMatch = trimmedLine.match(/Y(-?\d+(\.\d+)?)/);
            if (xMatch && yMatch) {
                const xVal = xMatch[1];
                const yVal = yMatch[1];
                // Perform a safe swap
                let newLine = line.replace(xMatch[0], `X_TEMP_`);
                newLine = newLine.replace(yMatch[0], `Y${xVal}`);
                newLine = newLine.replace(`X_TEMP_`, `X${yVal}`);
                tempLines2.push(newLine);
            }
            else {
                tempLines2.push(line);
            }
        }
        processedCode = tempLines2.join('\n');
        // Rule 3: Make all X values 0
        lines = processedCode.split('\n');
        const tempLines3 = [];
        for (const line of lines) {
            // This regex will find X followed by a number and replace it with X0
            tempLines3.push(line.replace(/X(-?\d+(\.\d+)?)/g, 'X0'));
        }
        processedCode = tempLines3.join('\n');
        // Pattern Repeater: Repeat the pattern with Y offset if repetitions > 1
        if (reps > 1) {
            const originalLines = processedCode.split('\n');
            // Separate header, content, and footer
            const headerLines = [];
            const contentLines = [];
            const footerLines = [];
            let inContent = false;
            let inFooter = false;
            for (const line of originalLines) {
                const trimmed = line.trim();
                // Footer detection (M5, M30, or final positioning)
                if (trimmed === 'M5' || trimmed === 'M30' || (trimmed.startsWith('X') && trimmed.includes('0') && !trimmed.includes('Y'))) {
                    inFooter = true;
                }
                // Header includes comments and initial setup commands
                if (!inContent && !inFooter && (trimmed.startsWith('%') || trimmed.startsWith('G1') || trimmed.startsWith('M3') || trimmed === '')) {
                    headerLines.push(line);
                    if (trimmed.startsWith('M3')) {
                        inContent = true; // Start content after M3
                    }
                }
                else if (inFooter) {
                    footerLines.push(line);
                }
                else if (inContent && !inFooter) {
                    contentLines.push(line);
                }
            }
            if (!contentLines.length)
                throw new Error('Repetition needs a header ending with M3 and a non-empty pattern before M5 / M30.');
            // Create repeated patterns
            const repeatedContent = [];
            for (let rep = 0; rep < reps; rep++) {
                const yOffset = rep * yStep;
                for (const line of contentLines) {
                    if (line.trim().match(/Y(-?\d+(\.\d+)?)/)) {
                        const modifiedLine = line.replace(/Y(-?\d+(\.\d+)?)/g, (match, yValue) => {
                            const newY = parseFloat(yValue) + yOffset;
                            return `Y${newY.toFixed(6)}`;
                        });
                        repeatedContent.push(modifiedLine);
                    }
                    else {
                        repeatedContent.push(line);
                    }
                }
            }
            // Combine header + repeated content + footer
            processedCode = [...headerLines, ...repeatedContent, ...footerLines].join('\n');
        }
        return processedCode;
    }
    const count = validateGcodeJob(sourceProgram, repeatCount, [bIncrement, rapidFeedrate, engravingFeedrate]);
    if (Number(rapidFeedrate) <= 0 || Number(engravingFeedrate) <= 0)
        throw new Error('Feedrates must be greater than zero.');
    const lines = sourceProgram.split('\n');
    const headerEndMarker = 'M3';
    const headerEndIndex = lines.findIndex(line => line.trim() === headerEndMarker);
    if (headerEndIndex === -1) {
        throw new Error('Could not find header end marker (M3). The header should end with M3 on its own line.');
    }
    const header = lines.slice(0, headerEndIndex + 1).join('\n');
    let lastZ4Index = -1;
    for (let i = lines.length - 1; i > headerEndIndex; i--) {
        if (/^Z4(?:\.0+)?(?=\s|[A-Z]|$)/.test(lines[i].trim())) {
            lastZ4Index = i;
            break;
        }
    }
    if (lastZ4Index === -1) {
        throw new Error('Could not find any "Z4" coordinate lines in the input G-code.');
    }
    const footer = lines.slice(lastZ4Index + 1).join('\n');
    const repeatableBlockTemplateLines = lines.slice(headerEndIndex + 1, lastZ4Index + 1)
        .filter(line => line.trim().length > 0);
    if (repeatableBlockTemplateLines.length === 0) {
        throw new Error('No repeatable block found between the header (ending in M3) and the footer.');
    }
    const generatedBlocks: string[] = [];
    const bIncrementValue = Number(bIncrement);
    for (let i = 0; i < count; i++) {
        const currentBValue = (i * bIncrementValue).toFixed(6);
        let fCommandCount = 0;
        const newBlock = repeatableBlockTemplateLines.map(line => {
            let processedLine = line.trim();
            if (processedLine.startsWith('F')) {
                fCommandCount++;
                if (fCommandCount === 1) {
                    processedLine = `F${Number(rapidFeedrate)}`;
                }
                else if (fCommandCount >= 2) {
                    processedLine = `F${Number(engravingFeedrate)}`;
                }
                return processedLine;
            }
            if (processedLine.includes('X') && processedLine.includes('Y')) {
                return `${processedLine} B${currentBValue}`;
            }
            return processedLine;
        }).join('\n');
        generatedBlocks.push(newBlock);
    }
    const finalGCode = [
        header,
        ...generatedBlocks,
        footer
    ].join('\n\n');
    return finalGCode;
}

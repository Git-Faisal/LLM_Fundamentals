/**
 * AI Network Visualization Component
 * Modular component for displaying AI research field network
 * Uses D3.js for interactive visualization
 */

// Global variables
let hierarchicalData = {};
let mainGroup;
let simulation;
let isExpanded = {}; // Track expansion state of filter items
let hiddenNodes = {}; // Track visibility state of nodes

/**
 * Initialize the AI Network component
 * @param {string} containerId - ID of the container element
 */
async function initializeAINetwork(containerId = 'ai-tree') {
    try {
        // Load the network data
        await loadNetworkData();

        // Initialize the visualization
        createNetworkVisualization();

        // Initialize filter controls
        initializeFilterControls();

        console.log('✅ AI Network initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize AI Network:', error);
        showErrorMessage();
    }
}

/**
 * Load network data from JSON file
 */
async function loadNetworkData() {
    try {
        const response = await fetch('./components/ai-network-data.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        hierarchicalData = data.hierarchicalData;

        console.log('📊 Network data loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load network data:', error);
        throw error;
    }
}

/**
 * Create the main network visualization
 */
function createNetworkVisualization() {
    // Get currently visible nodes
    const nodes = getVisibleNodes();
    const links = generateLinks();

    // Set up SVG dimensions - force full width to extend behind filter panel
    const svg = d3.select("#ai-network-svg");
    const container = document.querySelector('.graph-container');
    const aiNetwork = document.querySelector('.ai-network');

    // Use container's natural dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = 50;

    console.log(`🖼️ Graph dimensions: ${width}x${height} (natural container size)`);

    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    // Clear any existing content
    svg.selectAll("*").remove();

    // Create main group for zoom/pan
    mainGroup = svg.append("g").attr("class", "main-group");

    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            mainGroup.attr("transform", event.transform);
            updateZoomLevel(event.transform.k);
        });

    svg.call(zoom);

    // Create force simulation
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
            const sourceSize = d.source.size || 20;
            const targetSize = d.target.size || 20;
            const maxSize = Math.max(sourceSize, targetSize);

            // Increase distance for larger nodes to spread them out more
            if (maxSize >= 60) return maxSize * 5;      // Core AI & Major Fields
            if (maxSize >= 45) return maxSize * 4;      // Specialized Areas
            return maxSize * 3;                         // Smaller nodes
        }))
        .force("charge", d3.forceManyBody().strength(d => {
            // Stronger repulsion for larger nodes to spread them out
            if (d.size >= 60) return -d.size * 25;      // Core AI & Major Fields
            if (d.size >= 45) return -d.size * 20;      // Specialized Areas
            return -d.size * 15;                        // Smaller nodes
        }))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => {
            // More collision space for larger nodes
            if (d.size >= 60) return d.size + 25;       // Core AI & Major Fields
            if (d.size >= 45) return d.size + 20;       // Specialized Areas
            return d.size + 15;                         // Smaller nodes
        }));

    // Add links
    const link = mainGroup.selectAll(".network-link")
        .data(links)
        .enter()
        .append("line")
        .attr("class", d => `network-link ${d.strength}`)
        .attr("stroke", d => d.color || getLinkColor(d.source.id || d.source, d.target.id || d.target));

    // Add nodes
    const node = mainGroup.selectAll(".network-node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", d => `network-node ${d.type}`)
        .attr("data-node-id", d => d.id)
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Add circles to nodes
    node.append("circle")
        .attr("r", d => d.size)
        .on("click", function(event, d) {
            event.stopPropagation();
            if (d.children && d.children.length > 0) {
                toggleExpansion(d.id);
            }
        });

    // Add hover event listeners to nodes
    node
        .on("mouseenter", function(event, d) {
            highlightNode(d.id, true);
            highlightConnectedNodes(d.id, true);
        })
        .on("mouseleave", function(event, d) {
            highlightNode(d.id, false);
            highlightConnectedNodes(d.id, false);
        });

    // Add text labels with smart positioning
    node.each(function(d) {
        // Force Core AI node to have internal text
        const isCoreAI = d.id === 'ai' || d.name === 'Artificial Intelligence';
        // Allow internal text for Major Fields (size >= 55) and Specialized Areas (size >= 38)
        const needsExternalText = !isCoreAI && d.size < 38;

        if (needsExternalText) {
            // For smaller nodes: place text outside node, opposite to incoming line
            addExternalText(d3.select(this), d);
        } else {
            // For larger nodes: center text inside with hyphenation
            addInternalText(d3.select(this), d);
        }
    });

    function addExternalText(nodeElement, d) {
        // Find the incoming link to determine text placement
        const incomingLink = links.find(link =>
            (link.target.id || link.target) === d.id);

        let textX = 0, textY = 0, anchor = "middle";

        if (incomingLink) {
            // Calculate direction opposite to incoming link
            const source = incomingLink.source;
            const dx = d.x - (source.x || 0);
            const dy = d.y - (source.y || 0);
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0) {
                // Place text outside node, opposite to source with generous distance
                const distance = d.size + 35; // More distance to ensure no overlap
                textX = (dx / length) * distance;
                textY = (dy / length) * distance;

                // Adjust text anchor to ensure text doesn't overlap node
                if (textX > 20) anchor = "start"; // Text to the right
                else if (textX < -20) anchor = "end"; // Text to the left
                else anchor = "middle"; // Text above/below
            }
        } else {
            // Fallback: place text to the right if no incoming link found
            textX = d.size + 35;
            textY = 0;
            anchor = "start";
        }

        const text = nodeElement.append("text")
            .attr("x", textX)
            .attr("y", textY)
            .attr("text-anchor", anchor)
            .attr("dominant-baseline", "central")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .text(d.name);
    }

    function addInternalText(nodeElement, d) {
        const text = nodeElement.append("text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .style("font-size", d.size < 50 ? "12px" : d.size < 70 ? "14px" : "16px")
            .style("font-weight", "500");

        // Special handling for Core AI node
        const isCoreAI = d.id === 'ai' || d.name === 'Artificial Intelligence';
        if (isCoreAI) {
            // Split "Artificial Intelligence" into two centered lines
            if (d.name === 'Artificial Intelligence') {
                text.append("tspan")
                    .attr("x", 0)
                    .attr("dy", "-0.4em")
                    .text("Artificial");
                text.append("tspan")
                    .attr("x", 0)
                    .attr("dy", "1.2em")
                    .text("Intelligence");
            } else {
                // Fallback for any other core AI naming
                text.text(d.name);
            }
            return;
        }

        const radius = d.size * 0.75; // Use 75% of radius for text area
        const lineHeight = d.size < 50 ? 13 : d.size < 70 ? 15 : 17;
        const maxWidth = radius * 1.6;

        // Split text into words and handle hyphenation
        const words = d.name.split(/\s+/);
        let lines = [];
        let currentLine = [];

        words.forEach(word => {
            // Check if adding this word exceeds line width
            const testLine = [...currentLine, word].join(" ");
            const testSpan = text.append("tspan").text(testLine);
            const testWidth = testSpan.node().getComputedTextLength();
            testSpan.remove();

            if (testWidth <= maxWidth || currentLine.length === 0) {
                currentLine.push(word);
            } else {
                // If word is too long for a line by itself, hyphenate it
                if (currentLine.length === 0) {
                    const hyphenated = hyphenateWord(word, text, maxWidth);
                    lines.push(hyphenated[0]);
                    if (hyphenated[1]) {
                        currentLine = [hyphenated[1]];
                    }
                } else {
                    lines.push(currentLine.join(" "));
                    currentLine = [word];
                }
            }
        });

        if (currentLine.length > 0) {
            lines.push(currentLine.join(" "));
        }

        // Add tspan elements for each line
        lines.forEach((line, i) => {
            text.append("tspan")
                .attr("x", 0)
                .attr("dy", i === 0 ? -(lines.length - 1) * lineHeight / 2 : lineHeight)
                .text(line);
        });
    }

    function hyphenateWord(word, textElement, maxWidth) {
        if (word.length <= 4) return [word, null];

        // Try to split word with hyphen
        for (let i = 3; i < word.length - 2; i++) {
            const firstPart = word.substring(0, i) + "-";
            const testSpan = textElement.append("tspan").text(firstPart);
            const width = testSpan.node().getComputedTextLength();
            testSpan.remove();

            if (width <= maxWidth) {
                continue;
            } else {
                // Use previous position for split
                const splitPos = Math.max(3, i - 1);
                return [
                    word.substring(0, splitPos) + "-",
                    word.substring(splitPos)
                ];
            }
        }

        return [word, null]; // Fallback if can't hyphenate
    }

    // Update simulation on tick
    simulation.on("tick", () => {
        // Keep nodes within bounds (allow very close to edges)
        nodes.forEach(d => {
            d.x = Math.max(margin, Math.min(width - margin, d.x));
            d.y = Math.max(margin, Math.min(height - margin, d.y));
        });

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x}, ${d.y})`);

        // Update external text positions for smaller nodes
        node.each(function(d) {
            const isCoreAI = d.id === 'ai' || d.name === 'Artificial Intelligence';
            const isSubArea = !isCoreAI && d.size < 38;
            if (isSubArea) {
                const textElement = d3.select(this).select("text");
                const incomingLink = links.find(link =>
                    (link.target.id || link.target) === d.id);

                if (incomingLink && textElement.node()) {
                    const source = incomingLink.source;
                    const dx = d.x - source.x;
                    const dy = d.y - source.y;
                    const length = Math.sqrt(dx * dx + dy * dy);

                    if (length > 0) {
                        const distance = d.size + 35;
                        const textX = (dx / length) * distance;
                        const textY = (dy / length) * distance;

                        let anchor = "middle";
                        if (textX > 20) anchor = "start";
                        else if (textX < -20) anchor = "end";

                        textElement
                            .attr("x", textX)
                            .attr("y", textY)
                            .attr("text-anchor", anchor);
                    }
                }
            }
        });
    });

    // Setup UI controls
    setupZoomControls(svg, zoom);
    updateLegend();

    // Force panel transparency with JavaScript
    const filterPanel = document.querySelector('.filter-panel');
    const legendPanel = document.querySelector('.legend-panel-bottom');

    if (filterPanel) {
        filterPanel.style.display = 'block';
        filterPanel.style.visibility = 'visible';
    }

    if (legendPanel) {
        legendPanel.style.backgroundColor = 'rgba(26, 26, 26, 0.5)';
        legendPanel.style.backdropFilter = 'blur(10px)';
        legendPanel.style.webkitBackdropFilter = 'blur(10px)';
        legendPanel.style.border = '1px solid rgba(62, 62, 66, 0.5)';
    }
    updateFilter();
}

/**
 * Get all visible nodes based on current expansion states
 */
function getVisibleNodes() {
    const visible = [];
    const specializedNodes = new Map();

    // Always add AI core node
    const aiNode = hierarchicalData.ai;
    if (!aiNode) {
        console.error('❌ AI node not found in hierarchicalData');
        return [];
    }
    visible.push(aiNode);

    // If AI is expanded, add major fields
    if (aiNode.expanded && aiNode.children) {
        aiNode.children.forEach(childId => {
            const majorField = hierarchicalData[childId];
            if (majorField && majorField.visible !== false) {
                visible.push(majorField);

                // If major field is expanded, add its children
                if (majorField.expanded && majorField.children && majorField.children.length > 0) {
                    majorField.children.forEach(child => {
                        if (child.visible !== false) {
                            if (child.type === 'specialized') {
                                // Track specialized nodes
                                if (!specializedNodes.has(child.id)) {
                                    specializedNodes.set(child.id, {
                                        node: child,
                                        parents: []
                                    });
                                }
                                specializedNodes.get(child.id).parents.push(majorField.id);
                            } else {
                                visible.push(child);
                            }
                        }
                    });
                }
            }
        });
    }

    // Add specialized nodes
    specializedNodes.forEach((spec) => {
        visible.push(spec.node);
    });

    return visible;
}

/**
 * Generate links between visible nodes
 */
function generateLinks() {
    const baseLinks = [
        // Core connections
        { source: "ai", target: "ml", strength: "strong" },
        { source: "ai", target: "cv", strength: "strong" },
        { source: "ai", target: "nlp", strength: "strong" },
        { source: "ai", target: "robotics", strength: "strong" },
        { source: "ai", target: "kr", strength: "strong" },
        { source: "ai", target: "planning", strength: "strong" },
        { source: "ai", target: "multiagent", strength: "normal" },

        // Interdisciplinary connections
        { source: "ml", target: "dl", strength: "strong" },
        { source: "ml", target: "rl", strength: "strong" },
        { source: "ml", target: "cv", strength: "strong" },
        { source: "ml", target: "nlp", strength: "strong" },
        { source: "cv", target: "dl", strength: "strong" },
        { source: "cv", target: "robotics", strength: "strong" },
        { source: "nlp", target: "dl", strength: "strong" },
        { source: "nlp", target: "kr", strength: "normal" },
        { source: "robotics", target: "planning", strength: "strong" },
        { source: "robotics", target: "cv", strength: "strong" },
        { source: "robotics", target: "multiagent", strength: "normal" },
        { source: "kr", target: "reasoning", strength: "strong" },
        { source: "kr", target: "planning", strength: "normal" },
        { source: "planning", target: "reasoning", strength: "normal" },
        { source: "multiagent", target: "rl", strength: "normal" },
        { source: "cognitive", target: "kr", strength: "normal" },
        { source: "cognitive", target: "planning", strength: "normal" },
        { source: "hci", target: "cv", strength: "normal" },
        { source: "hci", target: "nlp", strength: "normal" }
    ];

    // Add expanded children links
    const expandedLinks = [];
    Object.values(hierarchicalData).forEach(parent => {
        if (parent.expanded && parent.children) {
            parent.children.forEach(child => {
                const childObj = typeof child === 'string' ? hierarchicalData[child] : child;
                if (childObj) {
                    expandedLinks.push({
                        source: parent.id,
                        target: childObj.id,
                        strength: "normal"
                    });
                }
            });
        }
    });

    // Filter to only visible nodes and add colors
    const visibleNodes = getVisibleNodes();
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    const validLinks = [...baseLinks, ...expandedLinks]
        .filter(link => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target))
        .map(link => ({
            ...link,
            color: getLinkColor(link.source, link.target)
        }));

    return validLinks;
}

/**
 * Get link color based on node types
 */
function getLinkColor(sourceId, targetId) {
    const getNodeType = (nodeId) => {
        const node = hierarchicalData[nodeId] ||
                    Object.values(hierarchicalData).find(n => n.children &&
                    n.children.some(c => (typeof c === 'string' ? c : c.id) === nodeId));
        return node ? node.type : 'niche';
    };

    const sourceType = getNodeType(sourceId);
    const targetType = getNodeType(targetId);

    // Use the parent (source) node color for links
    const sourceNode = hierarchicalData[sourceId];
    if (sourceNode) {
        return NODE_COLORS[sourceNode.type] || '#BDCEA9';
    }

    // Fallback to hierarchy-based colors
    if (sourceType === 'core') return NODE_COLORS.core;
    if (sourceType === 'major') return NODE_COLORS.major;
    if (sourceType === 'specialized') return NODE_COLORS.specialized;
    return NODE_COLORS.niche;
}

/**
 * Toggle expansion state of a node
 */
function toggleExpansion(nodeId) {
    // Check hierarchicalData first
    if (hierarchicalData[nodeId]) {
        hierarchicalData[nodeId].expanded = !hierarchicalData[nodeId].expanded;
        createNetworkVisualization(); // Refresh (includes updateFilter)
        return;
    }

    // Check child objects in hierarchicalData
    Object.values(hierarchicalData).forEach(parent => {
        if (parent.children) {
            parent.children.forEach(child => {
                const childObj = typeof child === 'string' ? hierarchicalData[child] : child;
                if (childObj && childObj.id === nodeId) {
                    // Initialize expanded property if it doesn't exist
                    if (childObj.expanded === undefined) {
                        childObj.expanded = false;
                    }
                    childObj.expanded = !childObj.expanded;
                    createNetworkVisualization(); // Refresh (includes updateFilter)
                    return;
                }
            });
        }
    });
}

/**
 * Toggle visibility state of a node
 */
function toggleVisibility(nodeId) {
    const node = hierarchicalData[nodeId];
    if (node) {
        node.visible = !node.visible;
        createNetworkVisualization(); // Refresh (includes updateFilter);
    } else {
        // Handle child nodes
        Object.values(hierarchicalData).forEach(parentNode => {
            if (parentNode.children) {
                parentNode.children.forEach(child => {
                    if ((typeof child === 'string' ? child : child.id) === nodeId) {
                        child.visible = child.visible !== false ? false : true;
                        createNetworkVisualization(); // Refresh (includes updateFilter);
                    }
                });
            }
        });
    }
}

/**
 * Update the legend with current counts
 */
function updateLegend() {
    const visibleNodes = getVisibleNodes();
    const counts = { core: 0, major: 0, specialized: 0, niche: 0 };

    visibleNodes.forEach(node => counts[node.type]++);

    const sections = document.querySelectorAll('.legend-panel-bottom .legend-section h4');
    if (sections.length >= 4) {
        sections[0].innerHTML = `<span style="color: ${NODE_COLORS.core}">● Core AI (${counts.core})</span>`;
        sections[1].innerHTML = `<span style="color: ${NODE_COLORS.major}">● Major Fields (${counts.major})</span>`;
        sections[2].innerHTML = `<span style="color: ${NODE_COLORS.specialized}">● Specialized Areas (${counts.specialized})</span>`;
        sections[3].innerHTML = `<span style="color: ${NODE_COLORS.niche}">● Sub-Areas (${counts.niche})</span>`;
    }
}

/**
 * Update the filter panel
 */
// Color mapping for different node types (30% darker for better contrast)
const NODE_COLORS = {
    'core': '#1a5194',
    'major': '#908258',
    'specialized': '#845353',
    'niche': '#84a476'
};

function updateFilter() {
    const filterContainer = document.getElementById('filter-items');
    if (!filterContainer) {
        console.error('❌ filter-items container not found');
        return;
    }

    filterContainer.innerHTML = '';

    // Add AI core node and its children recursively
    const aiNode = hierarchicalData.ai;
    if (!aiNode) {
        console.error('❌ AI node not found for filter');
        return;
    }

    addFilterItem(aiNode, filterContainer, 0);
    addFilterEventListeners();
}

function addFilterItem(node, container, indentLevel) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.expanded || false;
    const nodeColor = NODE_COLORS[node.type] || '#ffffff';

    // Create filter item
    const filterItem = document.createElement('div');
    filterItem.className = 'filter-item';
    filterItem.dataset.nodeId = node.id;
    filterItem.style.paddingLeft = `${indentLevel * 1}rem`;

    // Create expand arrow (only if has children)
    const arrow = hasChildren ?
        `<span class="expand-arrow" data-node-id="${node.id}" style="color: ${nodeColor}">${isExpanded ? 'v' : '>'}</span>` :
        '<span class="expand-arrow-spacer"></span>';

    filterItem.innerHTML = `
        <div class="filter-content">
            ${arrow}
            <span class="filter-text" style="color: ${nodeColor}">${node.name}</span>
            <button class="visibility-btn" data-node-id="${node.id}">${node.visible !== false ? '👁' : '👁‍🗨'}</button>
        </div>
    `;

    container.appendChild(filterItem);

    // Add children if expanded
    if (isExpanded && hasChildren) {
        node.children.forEach(child => {
            const childNode = typeof child === 'string' ? hierarchicalData[child] : child;
            if (childNode) {
                addFilterItem(childNode, container, indentLevel + 1);
            }
        });
    }
}

function addFilterEventListeners() {
    // Expand/collapse arrows
    document.querySelectorAll('.expand-arrow').forEach(arrow => {
        arrow.addEventListener('click', function(e) {
            e.stopPropagation();
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                toggleExpansion(nodeId);
            }
        });
    });

    // Visibility buttons
    document.querySelectorAll('.visibility-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const nodeId = this.dataset.nodeId;
            toggleVisibility(nodeId);
        });
    });

    // Filter item hover highlighting and click to expand
    document.querySelectorAll('.filter-item').forEach(item => {
        // Click anywhere on filter item to expand/collapse
        item.addEventListener('click', function(e) {
            // Don't trigger if clicking on visibility button
            if (e.target.classList.contains('visibility-btn')) {
                return;
            }

            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                // Check if this node has children and can be expanded
                const node = hierarchicalData[nodeId];
                if (node && node.children && node.children.length > 0) {
                    toggleExpansion(nodeId);
                }
            }
        });

        // Hover highlighting
        item.addEventListener('mouseenter', function() {
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                highlightNode(nodeId, true);
                highlightConnectedNodes(nodeId, true);
            }
        });

        item.addEventListener('mouseleave', function() {
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                highlightNode(nodeId, false);
                highlightConnectedNodes(nodeId, false);
            }
        });
    });
}

/**
 * Highlight a node in the graph
 */
function highlightNode(nodeId, highlight) {
    if (!mainGroup) return;

    const nodeElement = mainGroup.select(`g[data-node-id="${nodeId}"]`);
    if (nodeElement.empty()) return;

    if (highlight) {
        nodeElement.classed('highlighted-from-filter', true);
        nodeElement.select('circle').style('stroke-width', '4px').style('filter', 'brightness(1.3)');
    } else {
        nodeElement.classed('highlighted-from-filter', false);
        nodeElement.select('circle').style('stroke-width', null).style('filter', null);
    }
}

/**
 * Highlight nodes connected to the specified node using dimming
 */
function highlightConnectedNodes(nodeId, highlight) {
    if (!mainGroup) return;

    if (highlight) {
        // Find all links connected to this node
        const links = generateLinks();
        const connectedNodeIds = new Set([nodeId]); // Include the hovered node itself

        links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (sourceId === nodeId) {
                connectedNodeIds.add(targetId);
            } else if (targetId === nodeId) {
                connectedNodeIds.add(sourceId);
            }
        });

        // Dim all nodes that are NOT connected
        mainGroup.selectAll('.network-node').each(function(d) {
            const nodeElement = d3.select(this);
            if (!connectedNodeIds.has(d.id)) {
                nodeElement.classed('dimmed', true);
                nodeElement.select('circle').style('opacity', '0.2');
                nodeElement.select('text').style('opacity', '0.2');
            } else {
                // Keep connected nodes bright and add subtle highlight
                nodeElement.classed('highlighted', true);
                nodeElement.select('circle').style('stroke', '#E3D617').style('stroke-width', '3px');
            }
        });

        // Dim unconnected links and highlight connected ones
        mainGroup.selectAll('.network-link').each(function(d) {
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;

            if (sourceId === nodeId || targetId === nodeId) {
                // Highlight connected links
                d3.select(this).style('stroke-width', '4px').style('stroke-opacity', '1').style('stroke', '#E3D617');
            } else {
                // Dim unconnected links
                d3.select(this).style('opacity', '0.1');
            }
        });
    } else {
        // Reset all styling
        mainGroup.selectAll('.network-node')
            .classed('dimmed', false)
            .classed('highlighted', false);

        mainGroup.selectAll('.network-node circle')
            .style('opacity', null)
            .style('stroke', null)
            .style('stroke-width', null);

        mainGroup.selectAll('.network-node text')
            .style('opacity', null);

        mainGroup.selectAll('.network-link')
            .style('stroke-width', null)
            .style('stroke-opacity', null)
            .style('stroke', null)
            .style('opacity', null);
    }
}

/**
 * Setup zoom controls
 */
function setupZoomControls(svg, zoom) {
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 1.5);
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5);
        });
    }

    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            svg.transition().duration(500).call(
                zoom.transform,
                d3.zoomIdentity
            );
        });
    }
}

/**
 * Initialize filter control buttons
 */
function initializeFilterControls() {
    const expandToggleBtn = document.getElementById('expand-toggle-btn');
    const visibilityToggleBtn = document.getElementById('visibility-toggle-btn');

    if (expandToggleBtn) {
        expandToggleBtn.addEventListener('click', () => {
            const isExpandAll = expandToggleBtn.textContent === 'Expand All';

            // Get all nodes that can be expanded (have children)
            Object.keys(hierarchicalData).forEach(nodeId => {
                const node = hierarchicalData[nodeId];
                if (node && node.children && node.children.length > 0) {
                    const currentlyExpanded = node.expanded || false;
                    if (isExpandAll && !currentlyExpanded) {
                        node.expanded = true;
                    } else if (!isExpandAll && currentlyExpanded) {
                        node.expanded = false;
                    }
                }
            });

            // Refresh the visualization
            createNetworkVisualization();

            // Toggle button text
            expandToggleBtn.textContent = isExpandAll ? 'Collapse All' : 'Expand All';
        });
    }

    if (visibilityToggleBtn) {
        visibilityToggleBtn.addEventListener('click', () => {
            const isShowAll = visibilityToggleBtn.textContent === 'Show All';

            // Get all nodes except Core AI
            Object.keys(hierarchicalData).forEach(nodeId => {
                const node = hierarchicalData[nodeId];
                if (node && nodeId !== 'ai') { // Don't toggle Core AI
                    const currentlyVisible = node.visible !== false; // Default to visible if not set
                    if (isShowAll && !currentlyVisible) {
                        node.visible = true;
                    } else if (!isShowAll && currentlyVisible) {
                        node.visible = false;
                    }
                }
            });

            // Refresh the visualization
            createNetworkVisualization();

            // Toggle button text
            visibilityToggleBtn.textContent = isShowAll ? 'Hide All' : 'Show All';
        });
    }
}

/**
 * Update zoom level display
 */
function updateZoomLevel(scale) {
    const zoomLevelElement = document.getElementById('zoom-level');
    if (zoomLevelElement) {
        zoomLevelElement.textContent = Math.round(scale * 100) + '%';
    }
}

/**
 * Drag event handlers
 */
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

/**
 * Show error message if initialization fails
 */
function showErrorMessage() {
    const container = document.getElementById('ai-tree');
    if (container) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #ff4444;">
                <h3>AI Network Unavailable</h3>
                <p>The AI research field network could not be loaded.</p>
                <p style="font-size: 0.9em; color: #888;">Please check your connection and try again.</p>
            </div>
        `;
    }
}

// Make function globally available
window.initializeAINetwork = initializeAINetwork;
// GitLab Milestone Assignee Filter Content Script

(function () {
  "use strict";

  // Wait for page to be fully loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    // Check if we're on a milestone page with issues
    const milestoneContent = document.querySelector(".milestone-content");
    if (!milestoneContent) return;

    // Wait a bit for dynamic content to load
    setTimeout(() => {
      createAssigneeFilter();
    }, 500);
  }

  // LocalStorage functions for alternative assignee prefix (per repository)
  function getRepositoryKey() {
    // Extract repository URL from current location
    const url = window.location.href;
    
    // Match GitLab repository URL pattern (handles both gitlab.com and custom instances)
    const repoMatch = url.match(/^(https?:\/\/[^\/]+\/[^\/]+\/[^\/]+)/);
    if (repoMatch) {
      return repoMatch[1];
    }
    
    // Fallback: use domain + first two path segments
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      return `${urlObj.origin}/${pathParts[0]}/${pathParts[1]}`;
    }
    
    return urlObj.origin;
  }

  function saveAlternativeAssigneePrefix(prefix) {
    try {
      const repoKey = getRepositoryKey();
      const storageKey = `gitlab-alt-assignee-prefix-${btoa(repoKey).slice(0, 50)}`;
      localStorage.setItem(storageKey, prefix);
    } catch (e) {
      // Could not save alternative assignee prefix
    }
  }

  function loadAlternativeAssigneePrefix() {
    try {
      const repoKey = getRepositoryKey();
      const storageKey = `gitlab-alt-assignee-prefix-${btoa(repoKey).slice(0, 50)}`;
      const prefix = localStorage.getItem(storageKey);
      return prefix || "👤::";
    } catch (e) {
      // Could not load alternative assignee prefix
      return "👤::";
    }
  }

  // LocalStorage functions for Kanban board configuration
  function saveKanbanConfig(labels) {
    try {
      const key = getMilestoneKey() + "-kanban";
      const config = {
        labels: labels,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(config));
    } catch (e) {
      // Could not save Kanban configuration
    }
  }

  function loadKanbanConfig() {
    try {
      const key = getMilestoneKey() + "-kanban";
      const stored = localStorage.getItem(key);
      if (stored) {
        const config = JSON.parse(stored);
        // Return stored config if recent (within 30 days)
        const isRecent = config.timestamp && Date.now() - config.timestamp < 30 * 24 * 60 * 60 * 1000;
        return isRecent ? config.labels : [];
      }
    } catch (e) {
      // Could not load Kanban configuration
    }
    return [];
  }

  function saveViewMode(mode) {
    try {
      localStorage.setItem("gitlab-milestone-view-mode", mode);
    } catch (e) {
      // Could not save view mode
    }
  }

  function loadViewMode() {
    try {
      return localStorage.getItem("gitlab-milestone-view-mode") || "status";
    } catch (e) {
      return "status";
    }
  }

  // LocalStorage functions for remembering module states
  function saveModuleStates(assigneeVisible, labelVisible) {
    const states = {
      assigneeVisible: assigneeVisible,
      labelVisible: labelVisible,
      timestamp: Date.now(),
    };
    localStorage.setItem(
      "gitlab-milestone-filter-states",
      JSON.stringify(states)
    );
  }

  function loadModuleStates() {
    try {
      const stored = localStorage.getItem("gitlab-milestone-filter-states");
      if (stored) {
        const states = JSON.parse(stored);
        // Return stored states, or default to both hidden if data is old (24h)
        const isRecent =
          states.timestamp &&
          Date.now() - states.timestamp < 24 * 60 * 60 * 1000;
        return isRecent
          ? states
          : { assigneeVisible: false, labelVisible: false };
      }
    } catch (e) {
      // Could not load filter states
    }
    return { assigneeVisible: false, labelVisible: false };
  }

  // LocalStorage functions for remembering applied filters per milestone
  function getMilestoneKey() {
    // Extract milestone-specific part of URL (without hash)
    const url = window.location.href.split("#")[0];

    // Extract milestone number from URL for unique keys
    const milestoneMatch = url.match(/milestones\/(\d+)/);
    const milestoneId = milestoneMatch ? milestoneMatch[1] : "unknown";

    // Create a simple hash function for consistent short keys
    function simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(36);
    }

    // Create unique key with project hash + milestone ID
    const baseUrl = url.split("/milestones/")[0];
    const projectHash = simpleHash(baseUrl);
    const key = `gitlab-filters-${projectHash}-m${milestoneId}`;

    // Generated storage key for URL
    return key;
  }

  function saveAppliedFilters(assignee, labels) {
    try {
      const key = getMilestoneKey();
      const filterData = {
        assignee: assignee,
        labels: labels || [],
        timestamp: Date.now(),
        url: window.location.href.split("#")[0],
      };
      // Saving filters
      localStorage.setItem(key, JSON.stringify(filterData));
    } catch (e) {
      // Could not save applied filters
    }
  }

  function loadAppliedFilters() {
    try {
      const key = getMilestoneKey();
      const stored = localStorage.getItem(key);
      // Loading filters for key

      if (stored) {
        const filterData = JSON.parse(stored);
        const currentUrl = window.location.href.split("#")[0];
        // Return stored filters if recent (within 7 days) and URL matches
        const isRecent =
          filterData.timestamp &&
          Date.now() - filterData.timestamp < 7 * 24 * 60 * 60 * 1000;
        const urlMatches = filterData.url === currentUrl;
        // Filter validation
        return isRecent && urlMatches
          ? filterData
          : { assignee: null, labels: [] };
      }

      // Try to migrate from old key format if new key doesn't exist
      const oldKey = `gitlab-milestone-filters-${btoa(
        window.location.href.split("#")[0]
      ).slice(0, 50)}`;
      const oldStored = localStorage.getItem(oldKey);
      // Checking old key format

      if (oldStored) {
        const filterData = JSON.parse(oldStored);
        const currentUrl = window.location.href.split("#")[0];
        const isRecent =
          filterData.timestamp &&
          Date.now() - filterData.timestamp < 7 * 24 * 60 * 60 * 1000;
        const urlMatches = filterData.url === currentUrl;

        if (isRecent && urlMatches) {
          // Migrating from old key to new key
          // Migrate to new key format and remove old
          localStorage.setItem(key, oldStored);
          localStorage.removeItem(oldKey);
          return filterData;
        }
      }
    } catch (e) {
      // Could not load applied filters
    }
    return { assignee: null, labels: [] };
  }

  function cleanupOldStorageKeys() {
    // Clean up any old storage keys that might be causing conflicts
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("gitlab-milestone-filters-")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      // Removing old storage key
      localStorage.removeItem(key);
    });
  }

  function restoreAppliedFilters(assignees, labels) {
    const savedFilters = loadAppliedFilters();
    // Restoring filters

    // Restore assignee filter
    if (savedFilters.assignee) {
      const assigneeItem = document.querySelector(
        `[data-assignee-name="${savedFilters.assignee}"]`
      );
      // Looking for assignee
      if (assigneeItem) {
        assigneeItem.classList.add("selected");
        currentFilters.assignee = savedFilters.assignee;
      }
    }

    // Restore label filters
    if (savedFilters.labels && savedFilters.labels.length > 0) {
      // Restoring labels
      savedFilters.labels.forEach((labelName) => {
        const labelItem = document.querySelector(
          `[data-label-name="${labelName}"]`
        );
        // Looking for label
        if (labelItem) {
          labelItem.classList.add("selected");
          if (!currentFilters.labels.includes(labelName)) {
            currentFilters.labels.push(labelName);
          }
        }
      });
    }

    // Apply the restored filters if any were found
    if (
      savedFilters.assignee ||
      (savedFilters.labels && savedFilters.labels.length > 0)
    ) {
      applyCombinedFiltering();
      updateAssigneeCounts(assignees);
      updateLabelCounts(labels);
      updateSectionCounts();
      updateFilterButtons();
    }
  }

  function createAssigneeFilter() {
    // Extract all unique assignees and labels from the page
    const assignees = extractAssignees();
    const labels = extractLabels();

    if (assignees.length === 0 && labels.length === 0) return;

    // Create filter UI
    const filterContainer = createFilterUI(assignees, labels);

    // Load saved states and restore visibility
    const savedStates = loadModuleStates();

    // Initialize with saved states
    setTimeout(() => {
      const assigneeSection = document.querySelector(
        "#assignee-filter-section"
      );
      const labelSection = document.querySelector("#label-filter-section");

      if (assigneeSection) {
        assigneeSection.style.display = savedStates.assigneeVisible
          ? "block"
          : "none";
      }
      if (labelSection) {
        labelSection.style.display = savedStates.labelVisible
          ? "block"
          : "none";
      }

      // Show filter container if any section is visible
      updateFilterContainerVisibility(filterContainer);

      // Update toggle button states to match
      updateToggleButtonStates(
        savedStates.assigneeVisible,
        savedStates.labelVisible
      );
    }, 10);

    // Insert filter at the top of the milestone content
    const milestoneContent = document.querySelector(".milestone-content");
    if (milestoneContent) {
      milestoneContent.insertBefore(
        filterContainer,
        milestoneContent.firstChild
      );
    }

    // Add toggle buttons to the page header
    addToggleButtons(filterContainer);

    // Set up filtering functionality
    setupFiltering(assignees, labels);

    // Clean up old storage keys and restore previously applied filters for this milestone
    setTimeout(() => {
      cleanupOldStorageKeys();
      restoreAppliedFilters(assignees, labels);
    }, 300);
  }

  function extractAssignees() {
    const assignees = new Map(); // Use Map to avoid duplicates
    const altAssigneePrefix = loadAlternativeAssigneePrefix();

    // Find all assignee icons across all issue lists
    const assigneeIcons = document.querySelectorAll(
      '.assignee-icon a[title*="Assigned to"]'
    );

    assigneeIcons.forEach((link) => {
      const title = link.getAttribute("title");
      const img = link.querySelector("img");

      if (title && img) {
        // Extract name from title "Assigned to [Name]"
        const nameMatch = title.match(/Assigned to (.+)/);
        if (nameMatch) {
          const name = nameMatch[1];
          const avatarSrc = img.getAttribute("src");

          if (name && avatarSrc && !assignees.has(name)) {
            // Extract assignee ID from the link href
            const href = link.getAttribute("href");
            const idMatch = href ? href.match(/assignee_id=(\d+)/) : null;
            const assigneeId = idMatch ? idMatch[1] : null;

            assignees.set(name, {
              name: name,
              avatar: avatarSrc,
              id: assigneeId,
              link: link.getAttribute("href"),
              isAlternative: false,
            });
          }
        }
      }
    });

    // Extract alternative assignees from labels with the configured prefix
    const labelElements = document.querySelectorAll(".gl-label .gl-label-link");
    
    labelElements.forEach((link) => {
      const href = link.getAttribute("href");
      const labelSpan = link.querySelector(".gl-label-text");

      if (href && labelSpan) {
        // Extract label name from href parameter
        const urlMatch = href.match(/label_name=([^&]+)/);
        if (urlMatch) {
          const labelName = decodeURIComponent(urlMatch[1]);
          const labelText = labelSpan.textContent.trim();

          // Check if this label starts with the alternative assignee prefix
          if (labelText.startsWith(altAssigneePrefix)) {
            const assigneeName = labelText.substring(altAssigneePrefix.length).trim();
            
            if (assigneeName && !assignees.has(assigneeName)) {
              // Create alternative assignee entry (use milestone compass icon)
              assignees.set(assigneeName, {
                name: assigneeName,
                avatar: chrome.runtime.getURL("icons/icon48.png"), // Use the actual extension icon
                id: null,
                link: null,
                isAlternative: true,
                originalLabel: labelName,
              });
            }
          }
        }
      }
    });

    return Array.from(assignees.values()).sort((a, b) => {
      // Sort regular assignees first, then alternative assignees
      if (a.isAlternative && !b.isAlternative) return 1;
      if (!a.isAlternative && b.isAlternative) return -1;
      return a.name.localeCompare(b.name);
    });
  }

  function extractLabels() {
    const labels = new Map(); // Use Map to avoid duplicates
    const altAssigneePrefix = loadAlternativeAssigneePrefix();

    // Find all label elements across all issue lists
    const labelElements = document.querySelectorAll(".gl-label .gl-label-link");

    labelElements.forEach((link) => {
      const href = link.getAttribute("href");
      const labelSpan = link.querySelector(".gl-label-text");

      if (href && labelSpan) {
        // Extract label name from href parameter
        const urlMatch = href.match(/label_name=([^&]+)/);
        if (urlMatch) {
          const labelName = decodeURIComponent(urlMatch[1]);
          const labelText = labelSpan.textContent.trim();
          const labelColor = labelSpan.style.backgroundColor || "#808080";
          const isLightText = labelSpan.classList.contains(
            "gl-label-text-light"
          );

          // Skip labels that start with the alternative assignee prefix
          if (!labelText.startsWith(altAssigneePrefix) && labelName && labelText && !labels.has(labelName)) {
            labels.set(labelName, {
              name: labelName,
              text: labelText,
              color: labelColor,
              isLightText: isLightText,
              count: 0, // Will be calculated later
            });
          }
        }
      }
    });

    // Count occurrences of each label
    labels.forEach((labelData, labelName) => {
      const count = document.querySelectorAll(
        `.gl-label .gl-label-link[href*="label_name=${encodeURIComponent(
          labelName
        )}"]`
      ).length;
      labelData.count = count;
    });

    // Filter out labels with zero count and sort by count (descending) then by name
    return Array.from(labels.values())
      .filter((label) => label.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.text.localeCompare(b.text);
      });
  }

  function addToggleButtons(filterContainer) {
    // Find buttons in the header area - try multiple selectors
    let buttonContainer = null;

    // Look for Close milestone button specifically
    const closeMilestoneBtn = Array.from(
      document.querySelectorAll("button")
    ).find(
      (btn) =>
        btn.textContent.includes("Close milestone") ||
        btn.textContent.includes("close milestone")
    );

    if (closeMilestoneBtn) {
      buttonContainer = closeMilestoneBtn.parentElement;
    }

    // Fallback: look for any button container in the header
    if (!buttonContainer) {
      buttonContainer = document.querySelector(
        ".detail-page-header .btn-group, .milestone-detail-header .btn-group"
      );
    }

    // Another fallback: look for the header area itself
    if (!buttonContainer) {
      const header = document.querySelector(
        ".detail-page-header, .milestone-detail-header"
      );
      if (header) {
        // Create a button group if it doesn't exist
        const existingBtnGroup = header.querySelector(".btn-group");
        if (existingBtnGroup) {
          buttonContainer = existingBtnGroup;
        } else {
          buttonContainer = header;
        }
      }
    }

    // Last resort: add to the right side of any flex container in header
    if (!buttonContainer) {
      const flexContainer = document.querySelector(
        ".gl-display-flex.gl-justify-content-space-between"
      );
      if (flexContainer) {
        buttonContainer = flexContainer;
      }
    }

    if (buttonContainer) {
      // Create assignee toggle button
      const assigneeToggleButton = document.createElement("button");
      assigneeToggleButton.className =
        "btn btn-outline btn-md gl-button assignee-filter-toggle";
      assigneeToggleButton.innerHTML = `
                <svg class="gl-button-icon gl-icon s16" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-4.5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm9 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
                </svg>
                <span class="gl-button-text">Assignees</span>
            `;
      assigneeToggleButton.title = "Toggle assignee filter";
      assigneeToggleButton.style.marginLeft = "8px";
      assigneeToggleButton.style.opacity = "0.7";

      // Create label toggle button
      const labelToggleButton = document.createElement("button");
      labelToggleButton.className =
        "btn btn-outline btn-md gl-button label-filter-toggle";
      labelToggleButton.innerHTML = `
                <svg class="gl-button-icon gl-icon s16" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 4a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 0 1.414l-4.414 4.414a1 1 0 0 1-1.414 0L2.293 9.293A1 1 0 0 1 2 8.586V4zm3.5 0a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0z"/>
                </svg>
                <span class="gl-button-text">Labels</span>
            `;
      labelToggleButton.title = "Toggle label filter";
      labelToggleButton.style.marginLeft = "4px";
      labelToggleButton.style.opacity = "0.7";

      // Create Kanban view toggle button
      const kanbanToggleButton = document.createElement("button");
      kanbanToggleButton.className =
        "btn btn-outline btn-md gl-button kanban-view-toggle";
      kanbanToggleButton.innerHTML = `
                <svg class="gl-button-icon gl-icon s16" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2h3v12H2V2zm5 0h3v8H7V2zm5 0h3v5h-3V2z"/>
                </svg>
                <span class="gl-button-text">Kanban</span>
            `;
      kanbanToggleButton.title = "Toggle Kanban board view";
      kanbanToggleButton.style.marginLeft = "4px";
      kanbanToggleButton.style.opacity = "0.7";

      // Add click handlers
      assigneeToggleButton.addEventListener("click", () => {
        const assigneeSection = document.querySelector(
          "#assignee-filter-section"
        );
        const labelSection = document.querySelector("#label-filter-section");

        if (assigneeSection) {
          const isVisible = assigneeSection.style.display !== "none";
          const newVisibility = !isVisible;
          assigneeSection.style.display = newVisibility ? "block" : "none";

          // Update button appearance
          if (newVisibility) {
            assigneeToggleButton.classList.remove("btn-outline");
            assigneeToggleButton.classList.add("btn-default");
            assigneeToggleButton.style.opacity = "1";
          } else {
            assigneeToggleButton.classList.remove("btn-default");
            assigneeToggleButton.classList.add("btn-outline");
            assigneeToggleButton.style.opacity = "0.7";
          }

          // Show filter container if any section is visible
          updateFilterContainerVisibility(filterContainer);

          // Save states to localStorage
          const labelVisible =
            labelSection && labelSection.style.display !== "none";
          saveModuleStates(newVisibility, labelVisible);
        }
      });

      labelToggleButton.addEventListener("click", () => {
        const assigneeSection = document.querySelector(
          "#assignee-filter-section"
        );
        const labelSection = document.querySelector("#label-filter-section");

        if (labelSection) {
          const isVisible = labelSection.style.display !== "none";
          const newVisibility = !isVisible;
          labelSection.style.display = newVisibility ? "block" : "none";

          // Update button appearance
          if (newVisibility) {
            labelToggleButton.classList.remove("btn-outline");
            labelToggleButton.classList.add("btn-default");
            labelToggleButton.style.opacity = "1";
          } else {
            labelToggleButton.classList.remove("btn-default");
            labelToggleButton.classList.add("btn-outline");
            labelToggleButton.style.opacity = "0.7";
          }

          // Show filter container if any section is visible
          updateFilterContainerVisibility(filterContainer);

          // Save states to localStorage
          const assigneeVisible =
            assigneeSection && assigneeSection.style.display !== "none";
          saveModuleStates(assigneeVisible, newVisibility);
        }
      });

      // Add Kanban toggle handler
      kanbanToggleButton.addEventListener("click", () => {
        toggleKanbanView();
      });

      // Insert the buttons
      if (buttonContainer.classList.contains("btn-group")) {
        buttonContainer.appendChild(assigneeToggleButton);
        buttonContainer.appendChild(labelToggleButton);
        buttonContainer.appendChild(kanbanToggleButton);
      } else {
        // Create a wrapper div to keep buttons together
        const btnWrapper = document.createElement("div");
        btnWrapper.style.display = "flex";
        btnWrapper.style.alignItems = "center";
        btnWrapper.style.gap = "4px";
        btnWrapper.appendChild(assigneeToggleButton);
        btnWrapper.appendChild(labelToggleButton);
        btnWrapper.appendChild(kanbanToggleButton);
        buttonContainer.appendChild(btnWrapper);
      }
    }
  }

  function updateFilterContainerVisibility(filterContainer) {
    const assigneeSection = document.querySelector("#assignee-filter-section");
    const labelSection = document.querySelector("#label-filter-section");

    const assigneeVisible =
      assigneeSection && assigneeSection.style.display !== "none";
    const labelVisible = labelSection && labelSection.style.display !== "none";

    // Show container if any section is visible
    if (assigneeVisible || labelVisible) {
      filterContainer.style.display = "block";
    } else {
      filterContainer.style.display = "none";
    }
  }

  function updateToggleButtonStates(assigneeVisible, labelVisible) {
    const assigneeToggleButton = document.querySelector(
      ".assignee-filter-toggle"
    );
    const labelToggleButton = document.querySelector(".label-filter-toggle");

    if (assigneeToggleButton) {
      if (assigneeVisible) {
        assigneeToggleButton.classList.remove("btn-outline");
        assigneeToggleButton.classList.add("btn-default");
        assigneeToggleButton.style.opacity = "1";
      } else {
        assigneeToggleButton.classList.remove("btn-default");
        assigneeToggleButton.classList.add("btn-outline");
        assigneeToggleButton.style.opacity = "0.7";
      }
    }

    if (labelToggleButton) {
      if (labelVisible) {
        labelToggleButton.classList.remove("btn-outline");
        labelToggleButton.classList.add("btn-default");
        labelToggleButton.style.opacity = "1";
      } else {
        labelToggleButton.classList.remove("btn-default");
        labelToggleButton.classList.add("btn-outline");
        labelToggleButton.style.opacity = "0.7";
      }
    }
  }

  function createFilterUI(assignees, labels) {
    const container = document.createElement("div");
    container.className = "milestone-assignee-filter";
    container.innerHTML = `
            <div class="filter-header">
                <h4>Milestone Compass 🧭</h4>
            </div>
            <div class="filter-controls-row">
                <div class="search-container">
                    <input type="text" id="issue-title-search" placeholder="Search issue titles..." class="issue-search-input" />
                </div>
                <div class="search-info">
                     <span id="search-results-count" style="display: none;"></span>
                     <button id="clear-search" class="clear-search-btn" style="display: none;">Clear Search</button>
                 </div>
                <div class="filter-controls">
                    <button class="filter-btn filter-show-all active" data-action="show-all">
                        Show All (${getTotalIssueCount()})
                    </button>
                    <button class="filter-btn filter-show-unassigned" data-action="show-unassigned">
                        Unassigned (${getUnassignedIssueCount()})
                    </button>
                    <button class="filter-btn filter-clear" data-action="clear">
                        Clear Filter
                    </button>
                </div>
            </div>
            ${
              assignees.length > 0
                ? `
            <div class="filter-section" id="assignee-filter-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h5 style="margin: 0;">Assignees [ ${loadAlternativeAssigneePrefix()} ]</h5>
                    <button class="filter-btn prefix-config-btn" style="font-size: 11px; padding: 2px 6px;">Configure Prefix</button>
                </div>
                <div class="assignee-grid">
                    ${assignees
                      .map(
                        (assignee) => `
                        <div class="assignee-item ${assignee.isAlternative ? 'alternative-assignee' : ''}" data-assignee-id="${
                          assignee.id
                        }" data-assignee-name="${assignee.name}" data-is-alternative="${assignee.isAlternative || false}" data-original-label="${assignee.originalLabel || ''}" title="${
                          assignee.name
                        }${assignee.isAlternative ? ' (Alternative Assignee)' : ''}">
                            <img src="${assignee.avatar}" alt="${
                          assignee.name
                        }" class="assignee-avatar">
                            <span class="assignee-name" title="${
                              assignee.name
                            }">${assignee.name}</span>
                            <span class="issue-count">(${getIssueCountForAssignee(
                              assignee.name, assignee.isAlternative
                            )})</span>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
            `
                : ""
            }
            ${
              labels.length > 0
                ? `
            <div class="filter-section" id="label-filter-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h5 style="margin: 0;">Labels</h5>
                    <button class="filter-btn label-reset-btn" style="font-size: 11px; padding: 2px 6px;">Reset Labels</button>
                </div>
                <div class="label-search-container" style="margin-bottom: 8px;">
                    <input type="text" id="label-search-input" placeholder="Search labels..." style="width: 100%; padding: 4px 8px; font-size: 12px; border: 1px solid #555555; border-radius: 4px; background: #3a3a3a; color: #ffffff;" />
                </div>
                <div class="label-grid">
                    ${labels
                      .map(
                        (label) => `
                        <div class="label-item" data-label-name="${
                          label.name
                        }" data-label-text="${label.text}" title="${
                          label.text
                        }">
                            <span class="label-badge" style="background-color: ${
                              label.color
                            }; color: ${
                          label.isLightText ? "#ffffff" : "#000000"
                        };" title="${label.text}">
                                ${label.text}
                            </span>
                            <span class="issue-count">(${label.count})</span>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
            `
                : ""
            }
        `;

    return container;
  }

  // Global filter state
  let currentFilters = {
    assignee: null,
    labels: [], // Changed to array to support multiple labels
  };

  function setupFiltering(assignees, labels) {
    const container = document.querySelector(".milestone-assignee-filter");
    if (!container) return;

    // Handle assignee and label selection
    container.addEventListener("click", (e) => {
      const assigneeItem = e.target.closest(".assignee-item");
      const labelItem = e.target.closest(".label-item");
      const filterBtn = e.target.closest(".filter-btn");
      const labelResetBtn = e.target.closest(".label-reset-btn");
      const prefixConfigBtn = e.target.closest(".prefix-config-btn");
      const clearSearchBtn = e.target.closest("#clear-search");

      if (assigneeItem) {
        handleAssigneeSelection(assigneeItem, labels);
      } else if (labelItem) {
        handleLabelSelection(labelItem, assignees);
      } else if (labelResetBtn) {
        handleLabelReset(assignees, labels);
      } else if (prefixConfigBtn) {
        handlePrefixConfiguration();
      } else if (filterBtn) {
        handleFilterButton(filterBtn, assignees, labels);
      } else if (clearSearchBtn) {
        clearTitleSearch();
      }
    });

    // Set up label search functionality
    const labelSearchInput = document.getElementById("label-search-input");
    if (labelSearchInput) {
      labelSearchInput.addEventListener("input", (e) => {
        filterLabelsBySearch(e.target.value.toLowerCase());
      });
    }

    // Set up issue title search functionality
    const issueSearchInput = document.getElementById("issue-title-search");
    if (issueSearchInput) {
      issueSearchInput.addEventListener("input", (e) => {
        filterIssuesByTitle(e.target.value);
      });

      // Add keyboard shortcuts
      issueSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          clearTitleSearch();
        }
      });
    }
  }

  function handleAssigneeSelection(assigneeItem, labels) {
    const assigneeName = assigneeItem.getAttribute("data-assignee-name");

    // Toggle selection
    const isSelected = assigneeItem.classList.contains("selected");

    if (isSelected) {
      // Deselect assignee
      assigneeItem.classList.remove("selected");
      currentFilters.assignee = null;
    } else {
      // Clear previous assignee selection and select this one
      clearAssigneeSelections();
      assigneeItem.classList.add("selected");
      currentFilters.assignee = assigneeName;
    }

    // Don't clear the title search - keep it active and combine with assignee filter
    // clearTitleSearch(); // REMOVED THIS LINE

    // Apply combined filtering and update label counts
    applyCombinedFiltering();
    updateLabelCounts(labels);
    updateFilterButtons();

    // Save applied filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);
  }

  function handleLabelSelection(labelItem, assignees) {
    const labelName = labelItem.getAttribute("data-label-name");

    // Toggle selection
    const isSelected = labelItem.classList.contains("selected");

    if (isSelected) {
      // Deselect label - remove from array
      labelItem.classList.remove("selected");
      currentFilters.labels = currentFilters.labels.filter(
        (label) => label !== labelName
      );
    } else {
      // Add label to selection array
      labelItem.classList.add("selected");
      if (!currentFilters.labels.includes(labelName)) {
        currentFilters.labels.push(labelName);
      }
    }

    // Don't clear the title search - keep it active and combine with label filter
    // clearTitleSearch(); // REMOVED THIS LINE

    // Apply combined filtering and update assignee counts
    applyCombinedFiltering();
    updateAssigneeCounts(assignees);
    updateLabelCounts(extractLabels()); // Update label counts too
    updateFilterButtons();

    // Save applied filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);
  }

  function handleLabelReset(assignees, labels) {
    // Clear all label selections
    currentFilters.labels = [];
    clearLabelSelections();

    // Clear search input
    const searchInput = document.getElementById("label-search-input");
    if (searchInput) {
      searchInput.value = "";
      filterLabelsBySearch(""); // Reset search filter
    }

    // Don't clear the title search - keep it active and combine with reset labels
    // clearTitleSearch(); // REMOVED THIS LINE

    // Apply filtering and update counts
    applyCombinedFiltering();
    updateAssigneeCounts(assignees);
    updateLabelCounts(labels);
    updateSectionCounts();
    updateFilterButtons();

    // Save cleared filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);
  }

  function handlePrefixConfiguration() {
    const currentPrefix = loadAlternativeAssigneePrefix();
    const newPrefix = prompt(
      `Enter the prefix for alternative assignees:\n\nCurrent prefix: "${currentPrefix}"\n\nExamples:\n- 👤::\n- member::\n- @:\n- user::`,
      currentPrefix
    );

    if (newPrefix !== null && newPrefix.trim() !== "" && newPrefix !== currentPrefix) {
      saveAlternativeAssigneePrefix(newPrefix.trim());
      
      // Show confirmation and reload to apply changes
      if (confirm("Prefix updated successfully!\n\nThe page will reload to apply the changes.")) {
        window.location.reload();
      }
    }
  }

  function handleFilterButton(button, assignees, labels) {
    const action = button.getAttribute("data-action");

    clearAllSelections();
    currentFilters.assignee = null;
    currentFilters.labels = [];

    // Don't clear the title search - keep it active and combine with filter buttons
    // clearTitleSearch(); // REMOVED THIS LINE

    switch (action) {
      case "show-all":
        showAllIssues();
        button.classList.add("active");
        break;
      case "show-unassigned":
        filterUnassignedIssues();
        button.classList.add("active");
        break;
      case "clear":
        showAllIssues();
        updateFilterButtons();
        break;
    }

    // Save cleared filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);

    // Reset all counts to original values
    if (assignees) updateAssigneeCounts(assignees);
    if (labels) updateLabelCounts(labels);

    // Update filter buttons to reflect the new state
    updateFilterButtons();
  }

  function clearAllSelections() {
    clearAssigneeSelections();
    clearLabelSelections();
    document.querySelectorAll(".filter-btn.active").forEach((btn) => {
      btn.classList.remove("active");
    });
  }

  function clearAssigneeSelections() {
    document.querySelectorAll(".assignee-item.selected").forEach((item) => {
      item.classList.remove("selected");
    });
  }

  function clearLabelSelections() {
    document.querySelectorAll(".label-item.selected").forEach((item) => {
      item.classList.remove("selected");
    });
  }

  function filterLabelsBySearch(searchTerm) {
    const labelItems = document.querySelectorAll(".label-item");

    labelItems.forEach((item) => {
      const labelText = item.getAttribute("data-label-text").toLowerCase();
      const labelName = item.getAttribute("data-label-name").toLowerCase();

      // Check if search term matches
      const matchesSearch =
        searchTerm === "" ||
        labelText.includes(searchTerm) ||
        labelName.includes(searchTerm);

      // Check current filtering state (zero counts, etc.)
      const countSpan = item.querySelector(".issue-count");
      const count = countSpan
        ? parseInt(countSpan.textContent.replace(/[()]/g, ""))
        : 0;
      const isSelectedLabel = currentFilters.labels.includes(labelName);
      const hasActiveFilters =
        currentFilters.assignee || currentFilters.labels.length > 0;

      // Check if there's an active search
      const searchInput = document.getElementById("issue-title-search");
      const hasActiveSearch = searchInput && searchInput.value.trim() !== "";

      // Apply search filter, count-based filter, AND search-based filter logic
      const shouldShow =
        matchesSearch &&
        (count > 0 ||
          isSelectedLabel ||
          (!hasActiveFilters && !hasActiveSearch));

      item.style.display = shouldShow ? "flex" : "none";
    });

    // Show a "no results" message if no labels match
    updateSearchResults(searchTerm);
  }

  function updateSearchResults(searchTerm) {
    const labelGrid = document.querySelector(".label-grid");
    if (!labelGrid) return;

    // Remove existing "no results" message
    const existingMessage = labelGrid.querySelector(".no-results-message");
    if (existingMessage) {
      existingMessage.remove();
    }

    // Check if any labels are visible
    const visibleLabels = labelGrid.querySelectorAll(
      '.label-item[style*="flex"]'
    );
    const allLabels = labelGrid.querySelectorAll(".label-item");
    const hasVisibleLabels =
      visibleLabels.length > 0 ||
      Array.from(allLabels).some(
        (item) => !item.style.display || item.style.display === "flex"
      );

    // Show "no results" message if no matches and search term is not empty
    if (!hasVisibleLabels && searchTerm.trim() !== "") {
      const noResultsDiv = document.createElement("div");
      noResultsDiv.className = "no-results-message";
      noResultsDiv.style.cssText =
        "grid-column: 1 / -1; text-align: center; color: #888; font-style: italic; padding: 20px; font-size: 12px;";
      noResultsDiv.textContent = `No labels found for "${searchTerm}"`;
      labelGrid.appendChild(noResultsDiv);
    }
  }

  function applyCombinedFiltering() {
    const allIssues = document.querySelectorAll(".issuable-row");
    const searchInput = document.getElementById("issue-title-search");
    const hasActiveSearch = searchInput && searchInput.value.trim() !== "";

    allIssues.forEach((issue) => {
      let matches = true;

      // First check if issue matches search term (if any)
      if (hasActiveSearch) {
        // Look for the issue title in the correct location based on HTML structure
        const titleElement = issue.querySelector("span > a[title]");
        if (titleElement) {
          const title = titleElement.getAttribute("title").toLowerCase();
          const searchTerm = searchInput.value.toLowerCase();
          const searchMatches = title.includes(searchTerm);
          if (!searchMatches) {
            matches = false;
          }
        } else {
          // Fallback: try to find any text content in the first span
          const firstSpan = issue.querySelector("span");
          if (firstSpan) {
            const title = firstSpan.textContent.toLowerCase();
            const searchTerm = searchInput.value.toLowerCase();
            const searchMatches = title.includes(searchTerm);
            if (!searchMatches) {
              matches = false;
            }
          } else {
            // No title found - hide the issue
            matches = false;
          }
        }
      }

      // Then check assignee filter (including alternative assignees)
      if (matches && currentFilters.assignee) {
        const assigneeIcon = issue.querySelector(
          '.assignee-icon a[title*="Assigned to"]'
        );
        const normalAssigneeMatches =
          assigneeIcon &&
          assigneeIcon
            .getAttribute("title")
            .includes(`Assigned to ${currentFilters.assignee}`);
        
        // Check for alternative assignee labels
        const altAssigneePrefix = loadAlternativeAssigneePrefix();
        const expectedAltLabel = `${altAssigneePrefix}${currentFilters.assignee}`;
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
          const labelSpan = link.querySelector(".gl-label-text");
          return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
        });

        if (!normalAssigneeMatches && !alternativeAssigneeMatches) matches = false;
      }

      // Then check label filters (AND logic - issue must have ALL selected labels)
      if (matches && currentFilters.labels.length > 0) {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const issueLabels = Array.from(labelLinks).map((link) =>
          decodeURIComponent(
            link.getAttribute("href").split("label_name=")[1]?.split("&")[0] ||
              ""
          )
        );

        // Check if issue has ALL selected labels (AND logic)
        const allLabelsMatch = currentFilters.labels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );
        if (!allLabelsMatch) matches = false;
      }

      // Handle unassigned filter special case
      if (
        !currentFilters.assignee &&
        currentFilters.labels.length === 0 &&
        !hasActiveSearch
      ) {
        matches = true; // Show all when no filters applied
      }

      if (matches) {
        issue.style.display = "";
        issue.classList.add("filtered-visible");
        if (hasActiveSearch) {
          issue.classList.add("search-visible");
        }
      } else {
        issue.style.display = "none";
        issue.classList.remove("filtered-visible", "search-visible");
      }
    });

    updateSectionCounts();
    
    // Refresh Kanban board if it's currently displayed
    refreshKanbanBoardIfVisible();
  }

  function refreshKanbanBoardIfVisible() {
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard && kanbanBoard.style.display !== "none") {
      renderKanbanBoard(kanbanBoard);
    }
  }

  function updateAssigneeCounts(assignees) {
    assignees.forEach((assignee) => {
      const assigneeItem = document.querySelector(
        `[data-assignee-name="${assignee.name}"]`
      );
      if (assigneeItem) {
        const countSpan = assigneeItem.querySelector(".issue-count");
        if (countSpan) {
          let count;

          // Check if there's an active search
          const searchInput = document.getElementById("issue-title-search");
          const hasActiveSearch =
            searchInput && searchInput.value.trim() !== "";

          if (currentFilters.labels.length > 0) {
            // Count issues that have this assignee AND all selected labels
            count = getFilteredIssueCountForAssigneeWithMultipleLabels(
              assignee.name,
              currentFilters.labels
            );
          } else {
            count = getIssueCountForAssignee(assignee.name, assignee.isAlternative);
          }

          // If there's an active search, further filter by search term
          if (hasActiveSearch) {
            count = getFilteredIssueCountForAssigneeWithSearch(
              assignee.name,
              currentFilters.labels,
              searchInput.value
            );
          }

          countSpan.textContent = `(${count})`;

          // Hide assignees with zero count when filtering (but keep selected assignees visible)
          const isSelectedAssignee = currentFilters.assignee === assignee.name;
          const hasActiveFilters = currentFilters.labels.length > 0 || hasActiveSearch;
          
          if (hasActiveFilters && count === 0 && !isSelectedAssignee) {
            assigneeItem.style.display = "none";
          } else {
            assigneeItem.style.display = "flex";
          }
        }
      }
    });
  }

  function updateLabelCounts(labels) {
    labels.forEach((label) => {
      const labelItem = document.querySelector(
        `[data-label-name="${label.name}"]`
      );
      if (labelItem) {
        const countSpan = labelItem.querySelector(".issue-count");
        if (countSpan) {
          let count;

          // Check if there's an active search
          const searchInput = document.getElementById("issue-title-search");
          const hasActiveSearch =
            searchInput && searchInput.value.trim() !== "";

          // If this label is already selected, show its original count
          if (currentFilters.labels.includes(label.name)) {
            count = getFilteredIssueCountWithMultipleLabels(
              label.name,
              currentFilters.assignee,
              currentFilters.labels
            );
          } else if (
            currentFilters.assignee ||
            currentFilters.labels.length > 0
          ) {
            // Count issues that have this label AND the current filters
            count = getFilteredIssueCountWithMultipleLabels(
              label.name,
              currentFilters.assignee,
              currentFilters.labels
            );
          } else {
            count = label.count;
          }

          // If there's an active search, further filter by search term
          if (hasActiveSearch) {
            count = getFilteredIssueCountWithSearch(
              label.name,
              currentFilters.assignee,
              currentFilters.labels,
              searchInput.value
            );
          }

          countSpan.textContent = `(${count})`;

          // Hide labels with zero count when filtering (but keep selected labels visible)
          const hasActiveFilters =
            currentFilters.assignee ||
            currentFilters.labels.length > 0 ||
            hasActiveSearch;
          const isSelectedLabel = currentFilters.labels.includes(label.name);

          // Hide the label if it has zero count and there are active filters (unless it's selected)
          if (hasActiveFilters && count === 0 && !isSelectedLabel) {
            labelItem.style.display = "none";
          } else {
            labelItem.style.display = "flex";
          }
        }
      }
    });

    // Re-apply search filter to respect both count and search logic
    const searchInput = document.getElementById("label-search-input");
    if (searchInput) {
      filterLabelsBySearch(searchInput.value.toLowerCase());
    }
  }

  function filterByAssignee(assigneeName) {
    const allIssues = document.querySelectorAll(".issuable-row");

    allIssues.forEach((issue) => {
      const assigneeIcon = issue.querySelector(
        '.assignee-icon a[title*="Assigned to"]'
      );

      if (assigneeIcon) {
        const title = assigneeIcon.getAttribute("title");
        const isMatch = title && title.includes(`Assigned to ${assigneeName}`);

        if (isMatch) {
          issue.style.display = "";
          issue.classList.add("filtered-visible");
        } else {
          issue.style.display = "none";
          issue.classList.remove("filtered-visible");
        }
      } else {
        // No assignee - hide when filtering by specific assignee
        issue.style.display = "none";
        issue.classList.remove("filtered-visible");
      }
    });

    updateSectionCounts();
  }

  function filterUnassignedIssues() {
    const allIssues = document.querySelectorAll(".issuable-row");

    allIssues.forEach((issue) => {
      const assigneeIcon = issue.querySelector(
        '.assignee-icon a[title*="Assigned to"]'
      );
      const hasAssignee =
        assigneeIcon && assigneeIcon.getAttribute("title") !== "";

      // Check if issue has no assignee
      const isUnassigned = !hasAssignee;

      if (isUnassigned) {
        issue.style.display = "";
        issue.classList.add("filtered-visible");
      } else {
        issue.style.display = "none";
        issue.classList.remove("filtered-visible");
      }
    });

    // Apply any active search and label filters on top of unassigned filter
    // But only if there are active filters, otherwise keep the unassigned filter
    if (currentFilters.labels.length > 0) {
      applyCombinedFiltering();
    }
    updateSectionCounts();
  }

  function showAllIssues() {
    const allIssues = document.querySelectorAll(".issuable-row");

    allIssues.forEach((issue) => {
      issue.style.display = "";
      issue.classList.add("filtered-visible");
    });

    // Apply any active search and filters on top of show all
    applyCombinedFiltering();

    // Force update after a small delay to ensure DOM is updated
    setTimeout(() => {
      updateSectionCounts();
    }, 10);
  }

  function updateFilterButtons() {
    const hasSelection = document.querySelector(".assignee-item.selected");

    if (!hasSelection) {
      const showAllBtn = document.querySelector(".filter-show-all");
      if (showAllBtn) {
        showAllBtn.classList.add("active");
      }
    }
  }

  function updateSectionCounts() {
    // Update the counts in section headers
    const sections = [
      { selector: "#issues-list-unassigned", header: "Unstarted Issues" },
      { selector: "#issues-list-ongoing", header: "Ongoing Issues" },
      { selector: "#issues-list-closed", header: "Completed Issues" },
    ];

    sections.forEach((section) => {
      const list = document.querySelector(section.selector);
      if (list) {
        const allIssues = list.querySelectorAll(".issuable-row");
        const visibleIssues = list.querySelectorAll(
          '.issuable-row:not([style*="display: none"])'
        ).length;
        const header = list
          .closest(".gl-card")
          .querySelector(".gl-card-header .gl-text-subtle span");

        if (header) {
          // Store original count if not already stored
          if (!header.dataset.originalCount) {
            const originalText = header.textContent.trim();
            const numberMatch = originalText.match(/\d+/);
            header.dataset.originalCount = numberMatch
              ? numberMatch[0]
              : allIssues.length.toString();
          }

          const originalCount = header.dataset.originalCount;

          if (visibleIssues.toString() !== originalCount) {
            header.textContent = `[ ${visibleIssues} / ${originalCount} ]`;
            if (visibleIssues === 0) {
              header.style.color = "#ff3b3b"; // RED for zero issues
            } else {
              header.style.color = "#1fcb3c";
            }
            header.style.fontWeight = "bold";
          } else {
            header.textContent = originalCount;
            header.style.color = "";
            header.style.fontWeight = "";
          }
        }
      }
    });

    // Update the search results count if there's an active search
    const searchInput = document.getElementById("issue-title-search");
    const searchResultsCount = document.getElementById("search-results-count");

    if (searchInput && searchResultsCount) {
      if (searchInput.value.trim() !== "") {
        const totalVisibleIssues = document.querySelectorAll(
          '.issuable-row:not([style*="display: none"])'
        ).length;
        if (totalVisibleIssues === 0) {
          searchResultsCount.textContent = "No issues found";
          searchResultsCount.style.color = "#ff6b6b";
          searchResultsCount.style.display = "inline-block";
        } else {
          searchResultsCount.textContent = `Found ${totalVisibleIssues} issue${
            totalVisibleIssues === 1 ? "" : "s"
          }`;
          searchResultsCount.style.color = "#1fcb3c";
          searchResultsCount.style.display = "inline-block";
        }
      } else {
        // No active search - hide the results count
        searchResultsCount.style.display = "none";
      }
    }
  }

  // Helper functions for counting issues
  function getTotalIssueCount() {
    return document.querySelectorAll(".issuable-row").length;
  }

  function getUnassignedIssueCount() {
    return (
      document.querySelectorAll(".issuable-row").length -
      document.querySelectorAll(
        '.issuable-row .assignee-icon a[title*="Assigned to"]'
      ).length
    );
  }

  function getIssueCountForAssignee(assigneeName, isAlternative = false) {
    if (isAlternative) {
      // Count issues with the alternative assignee label
      const altAssigneePrefix = loadAlternativeAssigneePrefix();
      const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
      
      const issues = document.querySelectorAll(".issuable-row");
      let count = 0;
      
      issues.forEach((issue) => {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const hasAltAssigneeLabel = Array.from(labelLinks).some((link) => {
          const labelSpan = link.querySelector(".gl-label-text");
          return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
        });
        
        if (hasAltAssigneeLabel) count++;
      });
      
      return count;
    } else {
      return document.querySelectorAll(
        `.issuable-row .assignee-icon a[title="Assigned to ${assigneeName}"]`
      ).length;
    }
  }

  function getFilteredIssueCountForAssignee(assigneeName, labelName) {
    const issues = document.querySelectorAll(".issuable-row");
    let count = 0;

    issues.forEach((issue) => {
      const assigneeIcon = issue.querySelector(
        '.assignee-icon a[title*="Assigned to"]'
      );
      const hasAssignee =
        assigneeIcon &&
        assigneeIcon
          .getAttribute("title")
          .includes(`Assigned to ${assigneeName}`);

      if (hasAssignee) {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const hasLabel = Array.from(labelLinks).some((link) =>
          link
            .getAttribute("href")
            .includes(`label_name=${encodeURIComponent(labelName)}`)
        );
        if (hasLabel) count++;
      }
    });

    return count;
  }

  function getFilteredIssueCountForLabel(labelName, assigneeName) {
    const issues = document.querySelectorAll(".issuable-row");
    let count = 0;

    issues.forEach((issue) => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const hasLabel = Array.from(labelLinks).some((link) =>
        link
          .getAttribute("href")
          .includes(`label_name=${encodeURIComponent(labelName)}`)
      );

      if (hasLabel) {
        const assigneeIcon = issue.querySelector(
          '.assignee-icon a[title*="Assigned to"]'
        );
        const hasAssignee =
          assigneeIcon &&
          assigneeIcon
            .getAttribute("title")
            .includes(`Assigned to ${assigneeName}`);
        if (hasAssignee) count++;
      }
    });

    return count;
  }

  function getFilteredIssueCountForAssigneeWithMultipleLabels(
    assigneeName,
    selectedLabels
  ) {
    // Only count issues that are currently visible (not hidden by other filters)
    const visibleIssues = document.querySelectorAll(
      '.issuable-row:not([style*="display: none"])'
    );
    let count = 0;

    visibleIssues.forEach((issue) => {
      // Check assignee (both normal and alternative)
      const assigneeIcon = issue.querySelector(
        '.assignee-icon a[title*="Assigned to"]'
      );
      const normalAssigneeMatches =
        assigneeIcon &&
        assigneeIcon
          .getAttribute("title")
          .includes(`Assigned to ${assigneeName}`);
      
      // Check for alternative assignee labels
      const altAssigneePrefix = loadAlternativeAssigneePrefix();
      const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
        const labelSpan = link.querySelector(".gl-label-text");
        return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
      });

      if (!normalAssigneeMatches && !alternativeAssigneeMatches) return;

      // Check if issue has all selected labels
      if (selectedLabels.length > 0) {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const issueLabels = Array.from(labelLinks).map((link) =>
          decodeURIComponent(
            link.getAttribute("href").split("label_name=")[1]?.split("&")[0] ||
              ""
          )
        );

        const hasAllLabels = selectedLabels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );

        if (!hasAllLabels) return;
      }

      count++;
    });

    return count;
  }

  function getFilteredIssueCountWithMultipleLabels(
    labelName,
    assigneeName,
    selectedLabels
  ) {
    // Only count issues that are currently visible (not hidden by other filters)
    const visibleIssues = document.querySelectorAll(
      '.issuable-row:not([style*="display: none"])'
    );
    let count = 0;

    visibleIssues.forEach((issue) => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const issueLabels = Array.from(labelLinks).map((link) =>
        decodeURIComponent(
          link.getAttribute("href").split("label_name=")[1]?.split("&")[0] || ""
        )
      );

      // Check if issue has the target label
      const hasTargetLabel = issueLabels.includes(labelName);
      if (!hasTargetLabel) return;

      // Check assignee filter if specified (including alternative assignees)
      if (assigneeName) {
        const assigneeIcon = issue.querySelector(
          '.assignee-icon a[title*="Assigned to"]'
        );
        const normalAssigneeMatches =
          assigneeIcon &&
          assigneeIcon
            .getAttribute("title")
            .includes(`Assigned to ${assigneeName}`);
        
        // Check for alternative assignee labels
        const altAssigneePrefix = loadAlternativeAssigneePrefix();
        const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
          const labelSpan = link.querySelector(".gl-label-text");
          return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
        });

        if (!normalAssigneeMatches && !alternativeAssigneeMatches) return;
      }

      // Check if issue has all other selected labels (excluding the target label)
      const otherSelectedLabels = selectedLabels.filter(
        (label) => label !== labelName
      );
      if (otherSelectedLabels.length > 0) {
        const hasAllOtherLabels = otherSelectedLabels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );
        if (!hasAllOtherLabels) return;
      }

      count++;
    });

    return count;
  }

  function getFilteredIssueCountForAssigneeWithSearch(
    assigneeName,
    selectedLabels,
    searchTerm
  ) {
    // Only count issues that are currently visible (not hidden by other filters)
    const visibleIssues = document.querySelectorAll(
      '.issuable-row:not([style*="display: none"])'
    );
    let count = 0;

    visibleIssues.forEach((issue) => {
      // Check assignee (both normal and alternative)
      const assigneeIcon = issue.querySelector(
        '.assignee-icon a[title*="Assigned to"]'
      );
      const normalAssigneeMatches =
        assigneeIcon &&
        assigneeIcon
          .getAttribute("title")
          .includes(`Assigned to ${assigneeName}`);
      
      // Check for alternative assignee labels
      const altAssigneePrefix = loadAlternativeAssigneePrefix();
      const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
        const labelSpan = link.querySelector(".gl-label-text");
        return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
      });

      if (!normalAssigneeMatches && !alternativeAssigneeMatches) return;

      // Check if issue has all selected labels
      if (selectedLabels.length > 0) {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const issueLabels = Array.from(labelLinks).map((link) =>
          decodeURIComponent(
            link.getAttribute("href").split("label_name=")[1]?.split("&")[0] ||
              ""
          )
        );

        const hasAllLabels = selectedLabels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );

        if (!hasAllLabels) return;
      }

      // Check if issue matches the search term
      const titleElement = issue.querySelector("span > a[title]");
      if (titleElement) {
        const title = titleElement.getAttribute("title").toLowerCase();
        const matchesSearch = title.includes(searchTerm.toLowerCase());
        if (matchesSearch) count++;
      } else {
        // Fallback: try to find any text content in the first span
        const firstSpan = issue.querySelector("span");
        if (firstSpan) {
          const title = firstSpan.textContent.toLowerCase();
          const matchesSearch = title.includes(searchTerm.toLowerCase());
          if (matchesSearch) count++;
        }
      }
    });

    return count;
  }

  function getFilteredIssueCountWithSearch(
    labelName,
    assigneeName,
    selectedLabels,
    searchTerm
  ) {
    // Only count issues that are currently visible (not hidden by other filters)
    const visibleIssues = document.querySelectorAll(
      '.issuable-row:not([style*="display: none"])'
    );
    let count = 0;

    visibleIssues.forEach((issue) => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const issueLabels = Array.from(labelLinks).map((link) =>
        decodeURIComponent(
          link.getAttribute("href").split("label_name=")[1]?.split("&")[0] || ""
        )
      );

      // Check if issue has the target label
      const hasTargetLabel = issueLabels.includes(labelName);
      if (!hasTargetLabel) return;

      // Check assignee filter if specified (including alternative assignees)
      if (assigneeName) {
        const assigneeIcon = issue.querySelector(
          '.assignee-icon a[title*="Assigned to"]'
        );
        const normalAssigneeMatches =
          assigneeIcon &&
          assigneeIcon
            .getAttribute("title")
            .includes(`Assigned to ${assigneeName}`);
        
        // Check for alternative assignee labels
        const altAssigneePrefix = loadAlternativeAssigneePrefix();
        const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
          const labelSpan = link.querySelector(".gl-label-text");
          return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
        });

        if (!normalAssigneeMatches && !alternativeAssigneeMatches) return;
      }

      // Check if issue has all other selected labels (excluding the target label)
      const otherSelectedLabels = selectedLabels.filter(
        (label) => label !== labelName
      );
      if (otherSelectedLabels.length > 0) {
        const hasAllOtherLabels = otherSelectedLabels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );
        if (!hasAllOtherLabels) return;
      }

      // Check if issue matches the search term
      const titleElement = issue.querySelector("span > a[title]");
      if (titleElement) {
        const title = titleElement.getAttribute("title").toLowerCase();
        const matchesSearch = title.includes(searchTerm.toLowerCase());
        if (matchesSearch) count++;
      } else {
        // Fallback: try to find any text content in the first span
        const firstSpan = issue.querySelector("span");
        if (firstSpan) {
          const title = firstSpan.textContent.toLowerCase();
          const matchesSearch = title.includes(searchTerm.toLowerCase());
          if (matchesSearch) count++;
        }
      }
    });

    return count;
  }

  // Helper function to escape special regex characters
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Function to highlight search matches in issue titles
  function highlightSearchMatches(searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") {
      // Remove all highlighting when no search term
      document.querySelectorAll(".search-highlight").forEach((highlight) => {
        const parent = highlight.parentNode;
        if (parent) {
          parent.replaceChild(
            document.createTextNode(highlight.textContent),
            highlight
          );
          parent.normalize(); // Merge adjacent text nodes
        }
      });
      return;
    }

    const normalizedSearchTerm = searchTerm.toLowerCase();
    // Highlighting search term

    // Find all issue titles that are currently visible - try multiple selectors
    const selectors = [
      '.issuable-row:not([style*="display: none"]) span > a[title]',
      '.issuable-row:not([style*="display: none"]) span a[title]',
      '.issuable-row:not([style*="display: none"]) a[title]',
    ];

    let titleLinksFound = 0;

    selectors.forEach((selector) => {
      const titleLinks = document.querySelectorAll(selector);
      // Found title links with selector

      titleLinks.forEach((titleLink) => {
        titleLinksFound++;
        const title = titleLink.getAttribute("title");
        const titleText = titleLink.textContent;

        // Processing title

        // Remove existing highlights first
        if (titleLink.innerHTML.includes("search-highlight")) {
          titleLink.innerHTML = titleText;
        }

        // Check if title contains the search term
        if (title && title.toLowerCase().includes(normalizedSearchTerm)) {
          // Match found in title

          // Find all matches (case-insensitive) in the displayed text
          const regex = new RegExp(
            `(${escapeRegExp(normalizedSearchTerm)})`,
            "gi"
          );
          const matches = [...titleText.matchAll(regex)];

          // Text matches found

          if (matches.length > 0) {
            let highlightedText = titleText;
            let offset = 0;

            // Replace each match with highlighted version
            matches.forEach((match) => {
              const startIndex = match.index + offset;
              const endIndex = startIndex + match[0].length;

              const before = highlightedText.substring(0, startIndex);
              const matchText = highlightedText.substring(startIndex, endIndex);
              const after = highlightedText.substring(endIndex);

              highlightedText =
                before +
                `<span class="search-highlight">${matchText}</span>` +
                after;

              // Adjust offset for next iteration
              offset += '<span class="search-highlight"></span>'.length;
            });

            // Setting highlighted HTML
            titleLink.innerHTML = highlightedText;
          }
        }
      });
    });

    // Total title links processed
  }

  // Issue title search functionality
  function filterIssuesByTitle(searchTerm) {
    const searchInput = document.getElementById("issue-title-search");
    const clearSearchBtn = document.getElementById("clear-search");
    const searchResultsCount = document.getElementById("search-results-count");

    if (!searchInput || !clearSearchBtn || !searchResultsCount) return;

    const normalizedSearchTerm = searchTerm.toLowerCase();

    if (normalizedSearchTerm === "") {
      // No search term - show all issues based on current filters and hide clear button and results count
      // Remove all search styling from issues
      document.querySelectorAll(".issuable-row").forEach((issue) => {
        issue.classList.remove("search-visible");
      });

      // Remove all search highlighting
      highlightSearchMatches("");

      applyCombinedFiltering();
      clearSearchBtn.style.display = "none";
      searchResultsCount.style.display = "none";
      searchInput.classList.remove("has-search");

      const searchInfo = document.querySelector("#search-results-count");
      if (searchInfo) {
        searchInfo.style.display = "none";
      }

      return;
    }

    // Show clear button and results count, add search styling
    clearSearchBtn.style.display = "inline-block";
    searchResultsCount.style.display = "inline-block";
    searchInput.classList.add("has-search");

    // Show the entire search-info div when there's an active search
    const searchInfo = document.querySelector("#search-results-count");
    if (searchInfo) {
      searchInfo.style.display = "flex";
    }

    // Get all issues that match the current filters (assignee + labels)
    let filteredIssues = document.querySelectorAll(".issuable-row");

    // If there are active filters, only search within the filtered results
    if (currentFilters.assignee || currentFilters.labels.length > 0) {
      // First apply the current filters to get the base set
      filteredIssues = Array.from(filteredIssues).filter((issue) => {
        let matches = true;

        // Check assignee filter (including alternative assignees)
        if (currentFilters.assignee) {
          const assigneeIcon = issue.querySelector(
            '.assignee-icon a[title*="Assigned to"]'
          );
          const normalAssigneeMatches =
            assigneeIcon &&
            assigneeIcon
              .getAttribute("title")
              .includes(`Assigned to ${currentFilters.assignee}`);
          
          // Check for alternative assignee labels
          const altAssigneePrefix = loadAlternativeAssigneePrefix();
          const expectedAltLabel = `${altAssigneePrefix}${currentFilters.assignee}`;
          const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
          const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
            const labelSpan = link.querySelector(".gl-label-text");
            return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
          });

          if (!normalAssigneeMatches && !alternativeAssigneeMatches) matches = false;
        }

        // Check label filters (AND logic - issue must have ALL selected labels)
        if (matches && currentFilters.labels.length > 0) {
          const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
          const issueLabels = Array.from(labelLinks).map((link) =>
            decodeURIComponent(
              link
                .getAttribute("href")
                .split("label_name=")[1]
                ?.split("&")[0] || ""
            )
          );

          // Check if issue has ALL selected labels (AND logic)
          const allLabelsMatch = currentFilters.labels.every((selectedLabel) =>
            issueLabels.includes(selectedLabel)
          );
          if (!allLabelsMatch) matches = false;
        }

        return matches;
      });
    }

    let visibleCount = 0;

    // Now search within the filtered results
    filteredIssues.forEach((issue) => {
      // Look for the issue title in the correct location based on HTML structure
      // The title is in a <span> element with an <a> tag inside it
      const titleElement = issue.querySelector("span > a[title]");
      if (titleElement) {
        const title = titleElement.getAttribute("title").toLowerCase();
        const matches = title.includes(normalizedSearchTerm);

        if (matches) {
          issue.style.display = "";
          issue.classList.add("search-visible");
          visibleCount++;
        } else {
          issue.style.display = "none";
          issue.classList.remove("search-visible");
        }
      } else {
        // Fallback: try to find any text content in the first span
        const firstSpan = issue.querySelector("span");
        if (firstSpan) {
          const title = firstSpan.textContent.toLowerCase();
          const matches = title.includes(normalizedSearchTerm);

          if (matches) {
            issue.style.display = "";
            issue.classList.add("search-visible");
            visibleCount++;
          } else {
            issue.style.display = "none";
            issue.classList.remove("search-visible");
          }
        } else {
          // No title found - hide the issue
          issue.style.display = "none";
          issue.classList.remove("search-visible");
        }
      }
    });

    // Hide all other issues that don't match the current filters
    const filteredIssuesArray = Array.from(filteredIssues);
    document.querySelectorAll(".issuable-row").forEach((issue) => {
      if (!filteredIssuesArray.includes(issue)) {
        issue.style.display = "none";
        issue.classList.remove("search-visible");
      }
    });

    // Update search results count
    if (visibleCount === 0) {
      searchResultsCount.textContent = "No issues found";
      searchResultsCount.style.color = "#ff6b6b";
    } else {
      searchResultsCount.textContent = `Found ${visibleCount} issue${
        visibleCount === 1 ? "" : "s"
      }`;
      searchResultsCount.style.display = "inline-block";
      searchResultsCount.style.color = "#1fcb3c";
    }

    // Apply search highlighting to visible matches
    highlightSearchMatches(normalizedSearchTerm);

    // Update section counts to reflect search results
    updateSectionCounts();

    // Update assignee and label counts to reflect search results
    const assignees = extractAssignees();
    const labels = extractLabels();
    updateAssigneeCounts(assignees);
    updateLabelCounts(labels);
  }

  function clearTitleSearch() {
    const searchInput = document.getElementById("issue-title-search");
    const clearSearchBtn = document.getElementById("clear-search");
    const searchResultsCount = document.getElementById("search-results-count");

    if (searchInput) {
      searchInput.value = "";
      searchInput.classList.remove("has-search");
    }

    if (clearSearchBtn) {
      clearSearchBtn.style.display = "none";
    }

    if (searchResultsCount) {
      searchResultsCount.style.display = "none";
    }

    const searchInfo = document.querySelector("#search-results-count");
    if (searchInfo) {
      searchInfo.style.display = "none";
    }

    // Remove all search highlighting
    highlightSearchMatches("");

    // Clear search styling from all issues - this removes the highlighting
    document.querySelectorAll(".issuable-row").forEach((issue) => {
      issue.classList.remove("search-visible");
    });

    // Re-apply any existing filters (assignee + labels) to restore the filtered state
    if (currentFilters.assignee || currentFilters.labels.length > 0) {
      applyCombinedFiltering();
    } else {
      showAllIssues();
    }

    // Update section counts
    updateSectionCounts();

    // Update assignee and label counts to reflect cleared search
    const assignees = extractAssignees();
    const labels = extractLabels();
    updateAssigneeCounts(assignees);
    updateLabelCounts(labels);
  }

  // Override the existing showAllIssues function to reset ALL filters
  function showAllIssues() {
    // Clear ALL filters including search
    currentFilters.assignee = null;
    currentFilters.labels = [];

    // Clear search input and hide search info
    const searchInput = document.getElementById("issue-title-search");
    if (searchInput) {
      searchInput.value = "";
      searchInput.classList.remove("has-search");
    }

    // Hide search info
    const searchInfo = document.querySelector("#search-results-count");
    if (searchInfo) {
      searchInfo.style.display = "none";
    }

    // Clear all selections
    clearAllSelections();

    // Show all issues without any filters
    const allIssues = document.querySelectorAll(".issuable-row");
    allIssues.forEach((issue) => {
      issue.style.display = "";
      issue.classList.remove("search-visible", "filtered-visible");
    });

    // Force update after a small delay to ensure DOM is updated
    setTimeout(() => {
      updateSectionCounts();
    }, 10);
  }

  // Kanban Board Functionality
  function toggleKanbanView() {
    const currentMode = loadViewMode();
    const newMode = currentMode === "status" ? "kanban" : "status";
    console.log("GitLab Milestone Compass: Toggling from", currentMode, "to", newMode);
    saveViewMode(newMode);
    
    if (newMode === "kanban") {
      console.log("GitLab Milestone Compass: Switching to Kanban view");
      showKanbanView();
    } else {
      console.log("GitLab Milestone Compass: Switching to Status view");
      showStatusView();
    }
    
    updateViewToggleButton();
  }

  function updateViewToggleButton() {
    const kanbanToggle = document.querySelector(".kanban-view-toggle");
    const currentMode = loadViewMode();
    
    if (kanbanToggle) {
      if (currentMode === "kanban") {
        kanbanToggle.classList.remove("btn-outline");
        kanbanToggle.classList.add("btn-default");
        kanbanToggle.style.opacity = "1";
      } else {
        kanbanToggle.classList.remove("btn-default");
        kanbanToggle.classList.add("btn-outline");
        kanbanToggle.style.opacity = "0.7";
      }
    }
  }

  function showKanbanView() {
    // Hide the default status-based sections
    hideStatusSections();
    
    // Show or create the Kanban board
    createKanbanBoard();
  }

  function showStatusView() {
    // Hide the Kanban board
    hideKanbanBoard();
    
    // Show the default status-based sections
    showStatusSections();
  }

  function hideStatusSections() {
    const sections = document.querySelectorAll("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed");
    sections.forEach(section => {
      const card = section.closest(".gl-card");
      if (card) card.style.display = "none";
    });
  }

  function showStatusSections() {
    const sections = document.querySelectorAll("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed");
    sections.forEach(section => {
      const card = section.closest(".gl-card");
      if (card) card.style.display = "block";
    });
  }

  function hideKanbanBoard() {
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard) {
      kanbanBoard.style.display = "none";
    }
  }

  function createKanbanBoard() {
    let kanbanBoard = document.querySelector("#kanban-board");
    
    if (!kanbanBoard) {
      kanbanBoard = document.createElement("div");
      kanbanBoard.id = "kanban-board";
      kanbanBoard.className = "kanban-board";
      
      // Insert after the filter container or at a fallback location
      const filterContainer = document.querySelector(".milestone-assignee-filter");
      if (filterContainer) {
        filterContainer.parentNode.insertBefore(kanbanBoard, filterContainer.nextSibling);
      } else {
        // Fallback: insert before the first milestone content
        const milestoneContent = document.querySelector(".milestone-content");
        if (milestoneContent) {
          milestoneContent.insertBefore(kanbanBoard, milestoneContent.firstChild);
        } else {
          document.body.appendChild(kanbanBoard);
        }
      }
    }
    
    kanbanBoard.style.display = "block";
    renderKanbanBoard(kanbanBoard);
  }

  function renderKanbanBoard(kanbanBoard) {
    const config = loadKanbanConfig();
    const allLabels = extractLabels();
    
    // If no config exists, show a message and configuration option
    if (config.length === 0) {
      kanbanBoard.innerHTML = `
        <div class="gl-card kanban-header">
          <div class="gl-card-header">
            <h3 class="gl-card-title">Kanban Board</h3>
            <button class="btn btn-sm btn-default configure-kanban-btn">Configure Columns</button>
          </div>
        </div>
        <div class="kanban-empty-state">
          <div class="kanban-empty-content">
            <h4>Configure Your Kanban Board</h4>
            <p>Select the labels you want to use as columns for your Kanban board.</p>
            <button class="btn btn-default btn-md configure-kanban-action">Choose Labels</button>
          </div>
        </div>
      `;
      
      // Add both configure button handlers
      kanbanBoard.querySelector(".configure-kanban-btn").addEventListener("click", () => {
        showKanbanConfiguration(allLabels);
      });
      kanbanBoard.querySelector(".configure-kanban-action").addEventListener("click", () => {
        showKanbanConfiguration(allLabels);
      });
      return;
    }
    
    kanbanBoard.innerHTML = `
      <div class="gl-card kanban-header">
        <div class="gl-card-header">
          <h3 class="gl-card-title">Kanban Board</h3>
          <button class="btn btn-sm btn-default configure-kanban-btn">Configure</button>
        </div>
      </div>
      <div class="kanban-columns-container">
        ${renderKanbanColumns(config, allLabels)}
      </div>
    `;
    
    // Add configure button handler
    kanbanBoard.querySelector(".configure-kanban-btn").addEventListener("click", () => {
      showKanbanConfiguration(allLabels);
    });
  }

  function renderKanbanColumns(config, allLabels) {
    const allIssues = document.querySelectorAll(".issuable-row");
    let columns = "";
    let usedIssues = new Set(); // Track issues already placed in columns
    
    // Create columns for configured labels (only if they have issues)
    config.forEach(labelName => {
      const label = allLabels.find(l => l.name === labelName);
      if (label) {
        const issues = getFilteredIssuesForKanbanLabel(labelName, allIssues);
        // Only create column if it has issues
        if (issues.length > 0) {
          columns += createKanbanColumn(label, issues);
          // Track these issues as used
          issues.forEach(issue => {
            const issueUrl = getIssueUrlFromElement(issue);
            if (issueUrl) usedIssues.add(issueUrl);
          });
        }
      }
    });
    
    // Add MISC column for remaining issues (only issues NOT in other columns)
    const miscIssues = getFilteredMiscIssuesForKanban(config, allIssues, usedIssues);
    if (miscIssues.length > 0) {
      columns += createMiscColumn(miscIssues);
    }
    
    return columns;
  }

  function createKanbanColumn(label, issues) {
    // Create label with dynamic contrast
    const textColor = getContrastColor(label.color);
    let labelHTML = `<span class="gl-label-text" style="background-color: ${label.color}; color: ${textColor};">${label.text}</span>`;
    
    // Search for actual label element in the DOM to get any additional styling
    const allLabelElements = document.querySelectorAll('.gl-label .gl-label-text');
    const sampleLabelElement = Array.from(allLabelElements).find(el => 
      el.textContent.trim() === label.text
    );
    
    // If we can find the actual element, clone it and apply dynamic contrast
    if (sampleLabelElement) {
      const clonedLabel = sampleLabelElement.cloneNode(true);
      // Override the text color with our calculated contrast color
      clonedLabel.style.color = textColor;
      labelHTML = clonedLabel.outerHTML;
    }
    
    return `
      <div class="gl-card kanban-column" data-label="${label.name}">
        <div class="gl-card-header kanban-column-header">
          <span class="gl-label">
            ${labelHTML}
          </span>
          <span class="kanban-count">(${issues.length})</span>
        </div>
        <div class="gl-card-body kanban-column-content">
          ${issues.map(issue => createKanbanCard(issue, label.name)).join('')}
        </div>
      </div>
    `;
  }

  function createMiscColumn(issues) {
    return `
      <div class="gl-card kanban-column misc-column">
        <div class="gl-card-header kanban-column-header">
          <span class="gl-label">
            <span class="gl-label-text gl-label-text-dark" style="background-color: #999999;">
              MISC
            </span>
          </span>
          <span class="kanban-count">(${issues.length})</span>
        </div>
        <div class="gl-card-body kanban-column-content">
          ${issues.map(issue => createKanbanCard(issue, "MISC")).join('')}
        </div>
      </div>
    `;
  }

  function createKanbanCard(issue, currentColumnLabel = null) {
    // Get issue title and link - try multiple selectors in order of preference
    let titleElement = null;
    let title = "Unknown Issue";
    let link = "#";
    
    // Try different selectors for GitLab issue title
    const titleSelectors = [
      "span > a[title]",           // Standard GitLab format
      "a[title]",                  // Direct link with title
      ".issue-title-text a",       // Issue title wrapper
      ".issuable-title a",         // Alternative title class
      "a[href*='/issues/']",       // Any link to an issue
      ".gl-link[href*='/issues/']" // GitLab link class
    ];
    
    for (const selector of titleSelectors) {
      titleElement = issue.querySelector(selector);
      if (titleElement) {
        // Try to get title from multiple sources
        title = titleElement.getAttribute("title") || 
                titleElement.textContent.trim() || 
                titleElement.getAttribute("aria-label") ||
                "Unknown Issue";
        link = titleElement.getAttribute("href") || "#";
        
        // Clean up title text
        title = title.replace(/\s+/g, ' ').trim();
        
        if (title && title !== "" && title !== "Unknown Issue") {
          break;
        }
      }
    }
    
    // If still no good title, try to extract from any text content in the issue
    if (title === "Unknown Issue") {
      const textContent = issue.textContent.trim();
      if (textContent) {
        // Extract first meaningful line as title
        const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 5);
        if (lines.length > 0) {
          title = lines[0].substring(0, 100); // Limit to 100 chars
        }
      }
      
      // Debug logging to help identify the issue structure
      console.log("GitLab Milestone Compass: Could not extract title from issue:", {
        outerHTML: issue.outerHTML.substring(0, 200),
        textContent: issue.textContent.substring(0, 100),
        availableLinks: Array.from(issue.querySelectorAll('a')).map(a => ({
          href: a.getAttribute('href'),
          title: a.getAttribute('title'),
          text: a.textContent.trim()
        }))
      });
    }
    
    // Extract issue number from the link, title, or issue element
    let issueNumber = "";
    if (link) {
      const issueMatch = link.match(/\/issues\/(\d+)/);
      if (issueMatch) {
        issueNumber = `#${issueMatch[1]} `;
      }
    }
    
    // Try to get issue number from the issue element itself
    if (!issueNumber) {
      const issueNumberElement = issue.querySelector(".issue-number");
      if (issueNumberElement) {
        issueNumber = issueNumberElement.textContent.trim() + " ";
      }
    }
    
    // Get ONLY real GitLab assignees (NEVER alternative assignees)
    const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
    const assigneeName = assigneeIcon ? assigneeIcon.getAttribute("title").replace("Assigned to ", "") : null;
    const assigneeAvatar = assigneeIcon ? assigneeIcon.querySelector("img")?.getAttribute("src") : null;
    
    // Get labels with their actual styling
    const altAssigneePrefix = loadAlternativeAssigneePrefix();
    const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
    const labelElements = Array.from(labelLinks).map(link => {
      const span = link.querySelector(".gl-label-text");
      if (span) {
        const labelText = span.textContent.trim();
        
        // INCLUDE alternative assignee labels (show them in cards)
        // EXCLUDE the current column's label (redundant since it's already the column)
        const isAltAssigneeLabel = labelText.startsWith(altAssigneePrefix);
        const isCurrentColumnLabel = currentColumnLabel && labelText === currentColumnLabel;
        
        // Show alternative assignee labels, but skip the current column's label
        if (isCurrentColumnLabel && !isAltAssigneeLabel) {
          return null; // Skip column label unless it's an alt assignee
        }
        
        // Clone the actual label element and apply dynamic contrast
        const clonedSpan = span.cloneNode(true);
        clonedSpan.className = "gl-label-text gl-label-text-scoped kanban-label-clone";
        
        // Apply dynamic text color based on background contrast
        const bgColor = getComputedStyle(span).backgroundColor || span.style.backgroundColor;
        if (bgColor) {
          const textColor = getContrastColor(bgColor);
          clonedSpan.style.color = textColor;
        }
        
        return clonedSpan.outerHTML;
      }
      return null;
    }).filter(Boolean);
    
    return `
      <div class="issuable-row kanban-card" data-issue-url="${link}">
        <div class="kanban-card-title">
          <a href="${link}">${issueNumber}${title}</a>
        </div>
        ${assigneeName ? `
          <div class="kanban-card-assignee">
            <img src="${assigneeAvatar}" alt="${assigneeName}" class="assignee-icon">
            <span>${assigneeName}</span>
          </div>
        ` : ""}
        <div class="kanban-card-labels">
          ${labelElements.join("")}
        </div>
      </div>
    `;
  }

  function getIssuesForLabel(labelName, allIssues) {
    return Array.from(allIssues).filter(issue => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      return Array.from(labelLinks).some(link => {
        const href = link.getAttribute("href");
        if (href) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            const decodedLabel = decodeURIComponent(urlMatch[1]);
            return decodedLabel === labelName;
          }
        }
        return false;
      });
    });
  }

  function getMiscIssues(configuredLabels, allIssues) {
    return Array.from(allIssues).filter(issue => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const issueLabels = Array.from(labelLinks).map(link => {
        const href = link.getAttribute("href");
        if (href) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            return decodeURIComponent(urlMatch[1]);
          }
        }
        return null;
      }).filter(Boolean);
      
      // Include issues that don't have any of the configured labels
      return !configuredLabels.some(configLabel => issueLabels.includes(configLabel));
    });
  }

  // Filtered versions for Kanban that respect existing filter logic
  function getFilteredIssuesForKanbanLabel(labelName, allIssues) {
    return Array.from(allIssues).filter(issue => {
      // Ensure we're working with actual issue rows
      if (!issue.classList.contains('issuable-row')) {
        return false;
      }
      
      // First check if issue has the target label
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const hasTargetLabel = Array.from(labelLinks).some(link => {
        const href = link.getAttribute("href");
        if (href) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            const decodedLabel = decodeURIComponent(urlMatch[1]);
            return decodedLabel === labelName;
          }
        }
        return false;
      });
      
      if (!hasTargetLabel) return false;
      
      // Apply existing filter logic
      return applyFiltersToIssue(issue);
    });
  }

  function getIssueUrlFromElement(issue) {
    // Extract unique identifier from issue element
    const titleSelectors = [
      "span > a[href*='/issues/']",
      "a[href*='/issues/']",
      ".gl-link[href*='/issues/']"
    ];
    
    for (const selector of titleSelectors) {
      const linkElement = issue.querySelector(selector);
      if (linkElement) {
        const href = linkElement.getAttribute("href");
        if (href) {
          // Extract issue number from URL for unique identification
          const issueMatch = href.match(/\/issues\/(\d+)/);
          if (issueMatch) {
            return `/issues/${issueMatch[1]}`;
          }
        }
      }
    }
    
    // Fallback: use issue element's unique attributes
    return issue.getAttribute("data-issue-url") || null;
  }

  function getFilteredMiscIssuesForKanban(configuredLabels, allIssues, usedIssues = new Set()) {
    return Array.from(allIssues).filter(issue => {
      // Ensure we're working with actual issue rows
      if (!issue.classList.contains('issuable-row')) {
        return false;
      }
      
      // Skip if this issue is already used in another column
      const issueUrl = getIssueUrlFromElement(issue);
      if (issueUrl && usedIssues.has(issueUrl)) {
        return false;
      }
      
      // First check if issue doesn't have any configured labels
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const issueLabels = Array.from(labelLinks).map(link => {
        const href = link.getAttribute("href");
        if (href) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            return decodeURIComponent(urlMatch[1]);
          }
        }
        return null;
      }).filter(Boolean);
      
      const hasMiscCriteria = !configuredLabels.some(configLabel => issueLabels.includes(configLabel));
      if (!hasMiscCriteria) return false;
      
      // Apply existing filter logic
      return applyFiltersToIssue(issue);
    });
  }

  function applyFiltersToIssue(issue) {
    // Apply assignee filter (including alternative assignees)
    if (currentFilters.assignee) {
      const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
      const normalAssigneeMatches = assigneeIcon && assigneeIcon.getAttribute("title").includes(`Assigned to ${currentFilters.assignee}`);
      
      // Check for alternative assignee labels
      const altAssigneePrefix = loadAlternativeAssigneePrefix();
      const expectedAltLabel = `${altAssigneePrefix}${currentFilters.assignee}`;
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const altAssigneeMatches = Array.from(labelLinks).some(link => {
        const labelSpan = link.querySelector(".gl-label-text");
        return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
      });
      
      if (!normalAssigneeMatches && !altAssigneeMatches) return false;
    }
    
    // Apply label filters (AND logic)
    if (currentFilters.labels.length > 0) {
      const hasAllLabels = currentFilters.labels.every(filterLabel => {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        return Array.from(labelLinks).some(link => {
          const href = link.getAttribute("href");
          if (href) {
            const urlMatch = href.match(/label_name=([^&]+)/);
            if (urlMatch) {
              const decodedLabel = decodeURIComponent(urlMatch[1]);
              return decodedLabel === filterLabel;
            }
          }
          return false;
        });
      });
      if (!hasAllLabels) return false;
    }
    
    // Apply title search
    if (currentFilters.titleSearch && currentFilters.titleSearch.trim() !== "") {
      const titleElement = issue.querySelector("span > a[title]");
      const title = titleElement ? titleElement.getAttribute("title").toLowerCase() : "";
      const searchTerms = currentFilters.titleSearch.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      const hasAllTerms = searchTerms.every(term => title.includes(term));
      if (!hasAllTerms) return false;
    }
    
    return true;
  }

  function showKanbanConfiguration(allLabels) {
    const existingConfig = loadKanbanConfig();
    
    const modal = document.createElement("div");
    modal.className = "kanban-config-modal";
    modal.innerHTML = `
      <div class="kanban-config-content">
        <h3>Configure Kanban Board</h3>
        <p>Select and order the labels for your Kanban columns:</p>
        <div class="kanban-config-labels">
          <div class="available-labels">
            <h4>Available Labels</h4>
            <div class="label-list">
              ${allLabels.map(label => `
                <div class="config-label-item ${existingConfig.includes(label.name) ? 'selected' : ''}" 
                     data-label="${label.name}">
                  <span class="label-badge" style="background-color: ${label.color}; color: ${label.isLightText ? '#ffffff' : '#000000'};">
                    ${label.text}
                  </span>
                  <span class="label-count">(${label.count})</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="selected-labels">
            <h4>Kanban Columns (drag to reorder)</h4>
            <div class="selected-label-list" id="selected-labels">
              ${existingConfig.map(labelName => {
                const label = allLabels.find(l => l.name === labelName);
                return label ? `
                  <div class="selected-label-item" data-label="${label.name}">
                    <span class="label-badge" style="background-color: ${label.color}; color: ${label.isLightText ? '#ffffff' : '#000000'};">
                      ${label.text}
                    </span>
                    <button class="remove-label">×</button>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        </div>
        <div class="kanban-config-actions">
          <button class="btn btn-success save-kanban-config">Save Configuration</button>
          <button class="btn btn-outline cancel-kanban-config">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setupKanbanConfigHandlers(modal, allLabels);
  }

  function setupKanbanConfigHandlers(modal, allLabels) {
    // Add label selection handlers
    modal.addEventListener("click", (e) => {
      if (e.target.closest(".config-label-item") && !e.target.closest(".config-label-item.selected")) {
        const labelItem = e.target.closest(".config-label-item");
        const labelName = labelItem.getAttribute("data-label");
        addLabelToSelection(labelName, allLabels, modal);
        labelItem.classList.add("selected");
      }
      
      if (e.target.classList.contains("remove-label")) {
        const selectedItem = e.target.closest(".selected-label-item");
        const labelName = selectedItem.getAttribute("data-label");
        removeLabelFromSelection(labelName, modal);
      }
      
      if (e.target.classList.contains("save-kanban-config")) {
        saveKanbanConfiguration(modal);
      }
      
      if (e.target.classList.contains("cancel-kanban-config")) {
        modal.remove();
      }
    });
  }

  function addLabelToSelection(labelName, allLabels, modal) {
    const label = allLabels.find(l => l.name === labelName);
    if (!label) return;
    
    const selectedList = modal.querySelector("#selected-labels");
    const item = document.createElement("div");
    item.className = "selected-label-item";
    item.setAttribute("data-label", labelName);
    item.innerHTML = `
      <span class="label-badge" style="background-color: ${label.color}; color: ${label.isLightText ? '#ffffff' : '#000000'};">
        ${label.text}
      </span>
      <button class="remove-label">×</button>
    `;
    selectedList.appendChild(item);
  }

  function removeLabelFromSelection(labelName, modal) {
    const selectedItem = modal.querySelector(`.selected-label-item[data-label="${labelName}"]`);
    if (selectedItem) {
      selectedItem.remove();
    }
    
    const availableItem = modal.querySelector(`.config-label-item[data-label="${labelName}"]`);
    if (availableItem) {
      availableItem.classList.remove("selected");
    }
  }

  function saveKanbanConfiguration(modal) {
    const selectedItems = modal.querySelectorAll(".selected-label-item");
    const config = Array.from(selectedItems).map(item => item.getAttribute("data-label"));
    
    saveKanbanConfig(config);
    modal.remove();
    
    // Refresh the Kanban board
    createKanbanBoard();
  }



  // Color contrast utility functions
  function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Handle 3-character hex codes
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    return { r, g, b };
  }

  function rgbStringToRgb(rgbString) {
    // Parse rgb(r, g, b) or rgba(r, g, b, a) strings
    const match = rgbString.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3])
      };
    }
    return { r: 0, g: 0, b: 0 };
  }

  function getLuminance(r, g, b) {
    // Convert RGB to relative luminance using WCAG formula
    const rs = r / 255;
    const gs = g / 255;
    const bs = b / 255;
    
    const toLinear = (colorChannel) => {
      return colorChannel <= 0.03928
        ? colorChannel / 12.92
        : Math.pow((colorChannel + 0.055) / 1.055, 2.4);
    };
    
    return 0.2126 * toLinear(rs) + 0.7152 * toLinear(gs) + 0.0722 * toLinear(bs);
  }

  function getContrastColor(backgroundColor) {
    let rgb;
    
    // Handle different color formats
    if (backgroundColor.startsWith('#')) {
      rgb = hexToRgb(backgroundColor);
    } else if (backgroundColor.startsWith('rgb')) {
      rgb = rgbStringToRgb(backgroundColor);
    } else {
      // Fallback for unknown formats
      return '#000000';
    }
    
    // Calculate luminance
    const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
    
    // Use WCAG contrast ratio threshold
    // If luminance > 0.5, use dark text; otherwise use light text
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  // Initialize view mode on load
  setTimeout(() => {
    const currentMode = loadViewMode();
    console.log("GitLab Milestone Compass: Initializing with view mode:", currentMode);
    if (currentMode === "kanban") {
      console.log("GitLab Milestone Compass: Showing Kanban view");
      showKanbanView();
    }
    updateViewToggleButton();
  }, 100);
})();

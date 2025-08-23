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
    // Check if we're on a milestone page with issues (support multiple GitLab versions)
    const milestoneContent = document.querySelector(".milestone-content") || 
                            document.querySelector("[data-testid='milestone-content']") ||
                            document.querySelector(".milestone-detail") ||
                            document.querySelector("#tab-issues") ||
                            document.querySelector(".detail-page-description.milestone-detail") ||
                            document.querySelector("[id*='milestone']") ||
                            document.querySelector(".js-milestone-tabs");
    
    console.log("GitLab Milestone Compass: Checking milestone page...");
    console.log("URL:", window.location.href);
    console.log("Milestone content found:", !!milestoneContent);
    console.log("Tab issues found:", !!document.querySelector("#tab-issues"));
    console.log("Milestone detail found:", !!document.querySelector(".milestone-detail"));
    console.log("Work items lists found:", document.querySelectorAll("[id*='work_items-list']").length);
    
    if (!milestoneContent) {
      console.log("GitLab Milestone Compass: No milestone content found. Available elements:", 
        {
          tabIssues: !!document.querySelector("#tab-issues"),
          milestoneDetail: !!document.querySelector(".milestone-detail"),
          workItemsLists: document.querySelectorAll("[id*='work_items-list']").length,
          milestoneClasses: Array.from(document.querySelectorAll("*")).map(el => el.className).filter(c => c && c.includes('milestone')).slice(0, 5)
        });
      return;
    }
    
    console.log("GitLab Milestone Compass: Initializing on milestone page");

    // Wait a bit for dynamic content to load
    setTimeout(() => {
      // Build initial issue status mapping
      buildIssueStatusMap();
      createAssigneeFilter();
      
      // Initialize proper view mode after filters are created
      initializeViewMode();
    }, 600);
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

  // LocalStorage functions for Kanban board profiles
  function saveKanbanProfiles(profiles) {
    try {
      const key = getMilestoneKey() + "-kanban-profiles";
      const config = {
        profiles: profiles,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(config));
    } catch (e) {
      console.error("Could not save Kanban profiles:", e);
    }
  }

  function loadKanbanProfiles() {
    try {
      const key = getMilestoneKey() + "-kanban-profiles";
      const stored = localStorage.getItem(key);
      if (stored) {
        const config = JSON.parse(stored);
        // Return stored profiles if recent (within 30 days)
        const isRecent = config.timestamp && Date.now() - config.timestamp < 30 * 24 * 60 * 60 * 1000;
        if (isRecent && config.profiles) {
          return config.profiles;
        }
      }
    } catch (e) {
      console.error("Could not load Kanban profiles:", e);
    }
    
    // Try to migrate old single config to profile format
    return migrateOldKanbanConfig();
  }

  function saveActiveKanbanProfile(profileId) {
    try {
      const key = getMilestoneKey() + "-kanban-active";
      localStorage.setItem(key, profileId);
    } catch (e) {
      console.error("Could not save active Kanban profile:", e);
    }
  }

  function loadActiveKanbanProfile() {
    try {
      const key = getMilestoneKey() + "-kanban-active";
      return localStorage.getItem(key);
    } catch (e) {
      console.error("Could not load active Kanban profile:", e);
    }
    return null;
  }

  // Legacy support - convert old single config to profile format
  function migrateOldKanbanConfig() {
    try {
      const oldKey = getMilestoneKey() + "-kanban";
      const stored = localStorage.getItem(oldKey);
      
      if (stored) {
        const config = JSON.parse(stored);
        const isRecent = config.timestamp && Date.now() - config.timestamp < 30 * 24 * 60 * 60 * 1000;
        
        if (isRecent && config.labels && config.labels.length > 0) {
          const profiles = {
            'default': {
              id: 'default',
              title: 'Default',
              labels: config.labels
            }
          };
          saveKanbanProfiles(profiles);
          saveActiveKanbanProfile('default');
          localStorage.removeItem(oldKey); // Clean up old config
          console.log('Migrated old Kanban config to profile format');
          return profiles;
        }
      }
    } catch (e) {
      console.error('Failed to migrate old Kanban config:', e);
    }
    return {};
  }

  // Legacy function for backward compatibility
  function loadKanbanConfig() {
    const profiles = loadKanbanProfiles();
    const activeProfileId = loadActiveKanbanProfile();    
    
    if (activeProfileId && profiles[activeProfileId]) {
      const config = profiles[activeProfileId].labels || [];
      return config;
    }
    
    // Return first available profile's labels
    const firstProfile = Object.values(profiles)[0];
    const config = firstProfile ? firstProfile.labels || [] : [];
    return config;
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

    // Insert filter at the top of the milestone content (support multiple GitLab structures)
    let insertionPoint = null;
    let insertMode = "prepend"; // or "before"
    
    // Method 1: Original GitLab structure
    insertionPoint = document.querySelector(".milestone-content");
    if (insertionPoint) {
      insertionPoint.insertBefore(filterContainer, insertionPoint.firstChild);
    } else {
      // Method 2: GitLab.com structure - insert before the tab content
      insertionPoint = document.querySelector("#tab-issues");
      if (insertionPoint) {
        insertionPoint.parentNode.insertBefore(filterContainer, insertionPoint);
      } else {
        // Method 3: Insert before work items lists
        insertionPoint = document.querySelector('[id*="work_items-list"]');
        if (insertionPoint) {
          const container = insertionPoint.closest('.row, .gl-mt-3') || insertionPoint.parentNode;
          container.insertBefore(filterContainer, container.firstChild);
        } else {
          // Method 4: Fallback - insert after milestone detail
          insertionPoint = document.querySelector(".milestone-detail, .detail-page-description");
          if (insertionPoint) {
            insertionPoint.parentNode.insertBefore(filterContainer, insertionPoint.nextSibling);
          } else {
            console.log("GitLab Milestone Compass: Could not find insertion point for filter container");
          }
        }
      }
    }
    
    console.log("GitLab Milestone Compass: Inserted filter container using:", insertionPoint ? insertionPoint.className || insertionPoint.tagName : "none");

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

    // Method 1: Find all assignee icons across all issue lists (original GitLab structure)
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

    // Method 2: GitLab.com structure - find assignees in work item lists
    const workItemLists = document.querySelectorAll('[id*="work_items-list"]');
    workItemLists.forEach((list) => {
      const issues = list.querySelectorAll('li.\\!gl-border-b-section , li[class*="border"]');
      issues.forEach((issue) => {
        // GitLab.com structure: Look for assignee icons within assignee-icon spans
        const assigneeIcons = issue.querySelectorAll('.assignee-icon a img, .assignee-icon img');
        
        assigneeIcons.forEach((img) => {
          // Extract name from title attribute (e.g., "Assigned to Matthias Miller")
          const title = img.getAttribute('title');
          const avatarSrc = img.getAttribute('src');
          
          if (title && avatarSrc) {
            let name = null;
            
            // Try to extract name from title
            const assignedToMatch = title.match(/Assigned to (.+)/);
            if (assignedToMatch) {
              name = assignedToMatch[1];
            } else {
              // Fallback: use alt attribute if available
              name = img.getAttribute('alt');
            }
            
            if (name && !assignees.has(name)) {
              // Try to find assignee ID from parent link
              const parentLink = img.closest('a');
              const href = parentLink ? parentLink.getAttribute('href') : null;
              const idMatch = href ? href.match(/assignee_id=(\d+)/) : null;
              const assigneeId = idMatch ? idMatch[1] : null;

              assignees.set(name, {
                name: name,
                avatar: avatarSrc,
                id: assigneeId,
                link: href,
                isAlternative: false,
              });
              
              console.log("GitLab Milestone Compass: Found assignee:", name, "with ID:", assigneeId);
            }
          }
        });
      });
    });

    console.log("GitLab Milestone Compass: Found", assignees.size, "regular assignees");
    console.log("GitLab Milestone Compass: Work item lists found:", document.querySelectorAll('[id*="work_items-list"]').length);
    console.log("GitLab Milestone Compass: Issues in work item lists:", document.querySelectorAll('[id*="work_items-list"] li').length);
    console.log("GitLab Milestone Compass: Assignee icon elements found:", document.querySelectorAll('.assignee-icon img').length);
    console.log("GitLab Milestone Compass: All assignee-related elements:", 
      Array.from(document.querySelectorAll('.assignee-icon')).map(el => el.innerHTML));

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

    const finalAssignees = Array.from(assignees.values()).sort((a, b) => {
      // Sort regular assignees first, then alternative assignees
      if (a.isAlternative && !b.isAlternative) return 1;
      if (!a.isAlternative && b.isAlternative) return -1;
      return a.name.localeCompare(b.name);
    });
    
    console.log("GitLab Milestone Compass: Final assignees found:", finalAssignees.length);
    finalAssignees.forEach(assignee => {
      console.log(`  - ${assignee.name} (${assignee.isAlternative ? 'alternative' : 'regular'})`);
    });
    
    return finalAssignees;
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
            // Debug logging for emoji labels
            if (labelText.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u)) {
              console.log(`Found emoji label: "${labelText}" (name: "${labelName}") - href: ${href}`);
            }
            
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

    // Count occurrences of each label using multiple methods for robustness
    labels.forEach((labelData, labelName) => {
      // Method 1: Try URL-based counting (original method)
      const encodedName = encodeURIComponent(labelName);
      const selector = `.gl-label .gl-label-link[href*="label_name=${encodedName}"]`;
      let count = document.querySelectorAll(selector).length;
      
      // Method 2: If URL-based counting fails, try text-based counting
      if (count === 0) {
        const matchingSpans = Array.from(document.querySelectorAll(`.gl-label .gl-label-text`))
          .filter(span => span.textContent.trim() === labelData.text);
        count = matchingSpans.length;
        
        if (count > 0) {
          console.log(`Using text-based counting for label "${labelData.text}": found ${count} occurrences`);
        }
      }
      
      // Method 3: If both fail for emoji labels, try alternative URL encoding
      if (count === 0 && labelData.text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u)) {
        // Try different encoding methods for emojis
        const alternativeSelectors = [
          `.gl-label .gl-label-link[href*="label_name=${escape(labelName)}"]`,
          `.gl-label .gl-label-link[href*="${labelName}"]`,
        ];
        
        for (const altSelector of alternativeSelectors) {
          const altCount = document.querySelectorAll(altSelector).length;
          if (altCount > 0) {
            count = altCount;
            console.log(`Using alternative encoding for emoji label "${labelData.text}": selector="${altSelector}", count=${count}`);
            break;
          }
        }
      }
      
      labelData.count = count;
      
      // Debug logging for emoji labels
      if (labelData.text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u)) {
        console.log(`Final count for emoji label "${labelData.text}": ${count}`);
      }
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
    titleSearch: ""
  };
  
  // Persistent search state that survives view switches
  let persistentSearchState = "";

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
        const searchValue = e.target.value;
        
        // Always apply the search filter (including empty search)
        filterIssuesByTitle(searchValue);
        
        // CRITICAL FIX: Apply Kanban filters if Kanban board is visible (NO REBUILDING!)
        const kanbanBoard = document.querySelector("#kanban-board");
        if (kanbanBoard && kanbanBoard.style.display !== "none") {
          console.log(`[input event] Kanban board is visible, applying filters for search: "${searchValue}" (NO REBUILD)`);
          // Small delay to ensure filterIssuesByTitle has completed
          setTimeout(() => {
            // ONLY filter existing cards - do NOT rebuild the board
            applyKanbanFilters();
            // Always call highlighting function - it will clear highlights if search is empty
            highlightKanbanSearchMatches(searchValue.trim());
          }, 10);
        }
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

    console.log(`GitLab Milestone Compass: Assignee clicked: "${assigneeName}"`);

    // Clear the unassigned-only filter when selecting an assignee
    currentFilters.showUnassignedOnly = false;

    // Toggle selection
    const isSelected = assigneeItem.classList.contains("selected");

    if (isSelected) {
      // Deselect assignee
      assigneeItem.classList.remove("selected");
      currentFilters.assignee = null;
      console.log("GitLab Milestone Compass: Deselected assignee, cleared filter");
    } else {
      // Clear previous assignee selection and select this one
      clearAssigneeSelections();
      assigneeItem.classList.add("selected");
      currentFilters.assignee = assigneeName;
      console.log(`GitLab Milestone Compass: Selected assignee: "${assigneeName}"`);
    }

    // Don't clear the title search - keep it active and combine with assignee filter
    // clearTitleSearch(); // REMOVED THIS LINE

    // Check if Kanban board is active
    const kanbanBoard = document.querySelector("#kanban-board");
    const isKanbanActive = kanbanBoard && kanbanBoard.style.display !== "none";

    if (isKanbanActive) {
      // Apply Kanban filters and update counts
      applyKanbanFilters();
      console.log(`GitLab Milestone Compass: Applied Kanban filters after assignee selection: ${currentFilters.assignee}`);
    } else {
    // Apply combined filtering and update label counts
      console.log("GitLab Milestone Compass: Applying combined filtering...");
    applyCombinedFiltering();
    updateFilterButtons();
    }
    
    // Always update label counts regardless of view
    updateLabelCounts(labels);

    // Save applied filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);
  }

  function handleLabelSelection(labelItem, assignees) {
    const labelName = labelItem.getAttribute("data-label-name");

    // Clear the unassigned-only filter when selecting a label
    currentFilters.showUnassignedOnly = false;

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

    // Check if Kanban board is active
    const kanbanBoard = document.querySelector("#kanban-board");
    const isKanbanActive = kanbanBoard && kanbanBoard.style.display !== "none";

    if (isKanbanActive) {
      // Apply Kanban filters and update counts
      applyKanbanFilters();
      console.log(`GitLab Milestone Compass: Applied Kanban filters after label selection: ${currentFilters.labels.join(', ')}`);
    } else {
    // Apply combined filtering and update assignee counts
    applyCombinedFiltering();
    updateAssigneeCounts(assignees);
    updateFilterButtons();
    }
    
    // Always update label counts regardless of view
    updateLabelCounts(extractLabels());

    // Save applied filters to localStorage
    saveAppliedFilters(currentFilters.assignee, currentFilters.labels);
  }

  function handleLabelReset(assignees, labels) {
    // Clear all label selections
    currentFilters.labels = [];
    clearLabelSelections();
    
    // Clear the unassigned-only filter when resetting labels
    currentFilters.showUnassignedOnly = false;

    // Clear search input
    const searchInput = document.getElementById("label-search-input");
    if (searchInput) {
      searchInput.value = "";
      filterLabelsBySearch(""); // Reset search filter
    }

    // Don't clear the title search - keep it active and combine with reset labels
    // clearTitleSearch(); // REMOVED THIS LINE

    // Check if Kanban board is active
    const kanbanBoard = document.querySelector("#kanban-board");
    const isKanbanActive = kanbanBoard && kanbanBoard.style.display !== "none";

    if (isKanbanActive) {
      // Apply Kanban filters and update counts
      applyKanbanFilters();
      console.log(`GitLab Milestone Compass: Applied Kanban filters after label reset`);
    } else {
    // Apply filtering and update counts
    applyCombinedFiltering();
    updateAssigneeCounts(assignees);
    updateSectionCounts();
    updateFilterButtons();
    }
    
    // Always update label counts regardless of view
    updateLabelCounts(labels);

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
    currentFilters.showUnassignedOnly = false;

    // Don't clear the title search - keep it active and combine with filter buttons
    // clearTitleSearch(); // REMOVED THIS LINE

    // Check if Kanban board is active
    const kanbanBoard = document.querySelector("#kanban-board");
    const isKanbanActive = kanbanBoard && kanbanBoard.style.display !== "none";

    switch (action) {
      case "show-all":
        if (isKanbanActive) {
          // For Kanban, just apply the cleared filters
          applyKanbanFilters();
        } else {
        showAllIssues();
        }
        button.classList.add("active");
        break;
      case "show-unassigned":
        if (isKanbanActive) {
          // For Kanban, set a special flag to show only unassigned issues
          currentFilters.showUnassignedOnly = true;
          applyKanbanFilters();
        } else {
        filterUnassignedIssues();
        }
        button.classList.add("active");
        break;
      case "clear":
        if (isKanbanActive) {
          // For Kanban, just apply the cleared filters
          applyKanbanFilters();
        } else {
        showAllIssues();
        }
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
    // Support multiple GitLab DOM structures
    const allIssues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
    const searchInput = document.getElementById("issue-title-search");
    const hasActiveSearch = searchInput && searchInput.value.trim() !== "";

    console.log("GitLab Milestone Compass: Filtering", allIssues.length, "issues");
    console.log(`GitLab Milestone Compass: Current filters:`, {
      assignee: currentFilters.assignee,
      labels: currentFilters.labels,
      titleSearch: currentFilters.titleSearch
    });

    allIssues.forEach((issue) => {
      let matches = true;

      // First check if issue matches search term (if any)
      if (hasActiveSearch) {
        let title = "";
        
        // Strategy 1: GitLab.com structure - look for main issue link
        const gitlabComTitle = issue.querySelector('a.gl-text-default.gl-break-words');
        if (gitlabComTitle) {
          title = (gitlabComTitle.getAttribute('title') || gitlabComTitle.textContent || '').toLowerCase();
        } else {
          // Strategy 2: Original GitLab structure
        const titleElement = issue.querySelector("span > a[title]");
        if (titleElement) {
            title = titleElement.getAttribute("title").toLowerCase();
        } else {
            // Strategy 3: Fallback - try to find any text content in the first span
          const firstSpan = issue.querySelector("span");
          if (firstSpan) {
              title = firstSpan.textContent.toLowerCase();
            }
          }
        }
        
        if (title) {
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

      // Then check assignee filter (including alternative assignees)
      if (matches && currentFilters.assignee) {
        let normalAssigneeMatches = false;
        
        // Method 1: Original GitLab structure
        const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
        if (assigneeIcon) {
          normalAssigneeMatches = assigneeIcon.getAttribute("title").includes(`Assigned to ${currentFilters.assignee}`);
        }
        
        // Method 2: GitLab.com structure - look for assignee images within assignee-icon spans
        if (!normalAssigneeMatches) {
          const assigneeImages = issue.querySelectorAll('.assignee-icon a img, .assignee-icon img');
          normalAssigneeMatches = Array.from(assigneeImages).some(img => {
            const title = img.getAttribute('title');
            const alt = img.getAttribute('alt');
            
            // Check both title and alt attributes for the assignee name
            return (title && title.includes(`Assigned to ${currentFilters.assignee}`)) ||
                   (alt && alt === currentFilters.assignee);
          });
        }
        
        // Check for alternative assignee labels
        const altAssigneePrefix = loadAlternativeAssigneePrefix();
        const expectedAltLabel = `${altAssigneePrefix}${currentFilters.assignee}`;
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const alternativeAssigneeMatches = Array.from(labelLinks).some((link) => {
          const labelSpan = link.querySelector(".gl-label-text");
          return labelSpan && labelSpan.textContent.trim() === expectedAltLabel;
        });

        console.log(`GitLab Milestone Compass: Checking assignee filter for "${currentFilters.assignee}" - normalMatch: ${normalAssigneeMatches}, altMatch: ${alternativeAssigneeMatches}`);
        
        if (!normalAssigneeMatches && !alternativeAssigneeMatches) {
          matches = false;
          console.log(`GitLab Milestone Compass: Issue FILTERED OUT (no assignee match)`, {
            issueTitle: issue.querySelector('a.gl-text-default, span > a[title]')?.textContent?.trim() || 'No title',
            expectedAssignee: currentFilters.assignee
          });
        } else {
          console.log(`GitLab Milestone Compass: Issue MATCHES assignee filter`, {
            issueTitle: issue.querySelector('a.gl-text-default, span > a[title]')?.textContent?.trim() || 'No title',
            assignee: currentFilters.assignee
          });
        }
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
        console.log(`GitLab Milestone Compass: Issue SHOWN:`, issue.querySelector('a.gl-text-default, span > a[title]')?.textContent?.trim() || 'No title');
      } else {
        issue.style.display = "none";
        issue.classList.remove("filtered-visible", "search-visible");
        console.log(`GitLab Milestone Compass: Issue HIDDEN:`, issue.querySelector('a.gl-text-default, span > a[title]')?.textContent?.trim() || 'No title');
      }
    });

    updateSectionCounts();
    
    // Rebuild Kanban board if visible (filters changed, so need fresh data)
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard && kanbanBoard.style.display !== "none") {
      console.log(`[applyCombinedFiltering] Kanban board is visible, rebuilding with new filters: assignee="${currentFilters.assignee}", labels=[${currentFilters.labels.join(', ')}]`);
      
      // Rebuild the board to reflect new filtered issues
      renderKanbanBoard(kanbanBoard);
      
      // Apply search highlighting if there's an active search
      const searchInput = document.getElementById("issue-title-search");
      if (searchInput && searchInput.value.trim() !== "") {
        setTimeout(() => {
          highlightKanbanSearchMatches(searchInput.value.trim());
        }, 50);
      }
    }
  }

  function refreshKanbanBoardIfVisible() {
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard && kanbanBoard.style.display !== "none") {
      renderKanbanBoard(kanbanBoard);
      
      // Ensure search state is transferred to Kanban view
      const searchInput = document.getElementById("issue-title-search");
      if (searchInput && searchInput.value.trim() !== "") {
        console.log(`[refreshKanbanBoardIfVisible] Transferring search state: "${searchInput.value}"`);
        currentFilters.titleSearch = searchInput.value;
      }
      
      // Apply Kanban filters (search + hide closed)
      applyKanbanFilters();
      
      // Apply search highlighting after filters
      if (searchInput && searchInput.value.trim() !== "") {
        setTimeout(() => {
          highlightKanbanSearchMatches(searchInput.value.trim());
        }, 50);
      }
    }
  }

  // Function to highlight search matches in Kanban card titles
  function highlightKanbanSearchMatches(searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") {
      // Remove all highlighting when no search term
      document.querySelectorAll(".kanban-card .search-highlight").forEach((highlight) => {
        const parent = highlight.parentNode;
        if (parent) {
          parent.replaceChild(
            document.createTextNode(highlight.textContent),
            highlight
          );
          parent.normalize();
        }
      });
      return;
    }

    const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    const kanbanCards = document.querySelectorAll(".kanban-card");

    console.log(`[highlightKanbanSearchMatches] Highlighting search terms: [${searchTerms.join(', ')}]`);

    kanbanCards.forEach((card) => {
      const titleLink = card.querySelector(".kanban-card-title a");
      if (!titleLink) return;

      const titleText = titleLink.textContent;
      const title = titleText.toLowerCase();

      // Remove existing highlights first
      if (titleLink.innerHTML.includes("search-highlight")) {
        titleLink.textContent = titleText;
      }

      // Check if title contains any of the search terms
      const hasAnyTerm = searchTerms.some(term => title.includes(term));
      if (hasAnyTerm) {
        let highlightedText = titleText;
        
        // Highlight each search term
        searchTerms.forEach(term => {
          const searchRegex = new RegExp(
            `(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi"
          );
          
          highlightedText = highlightedText.replace(searchRegex, 
            `<span class="search-highlight">$1</span>`
          );
        });

        // Set highlighted HTML
        titleLink.innerHTML = highlightedText;
        console.log(`[highlightKanbanSearchMatches] Highlighted: "${titleText}" -> "${highlightedText}"`);
      }
    });
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

  // Get all issues that match current assignee filter (for smart label filtering)
  function getFilteredIssuesForSmartFiltering() {
    const allIssues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
    const alternativeAssigneePrefix = loadAlternativeAssigneePrefix();
    
    return Array.from(allIssues).filter(issue => {
      // Apply assignee filter if active
      if (currentFilters.assignee) {
        let hasAssignee = false;
        
        // Check normal assignees
        const assigneeImages = issue.querySelectorAll('img[alt], img[title]');
        const normalAssigneeMatches = Array.from(assigneeImages).some(img => {
          const name = img.getAttribute('alt') || img.getAttribute('title') || '';
          return name.toLowerCase().includes(currentFilters.assignee.toLowerCase());
        });
        
        // Check alternative assignees
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const alternativeAssigneeMatches = Array.from(labelLinks).some(link => {
          const labelSpan = link.querySelector(".gl-label-text");
          if (labelSpan) {
            const labelText = labelSpan.textContent.trim();
            if (labelText.startsWith(alternativeAssigneePrefix)) {
              const labelAssigneeName = labelText.substring(alternativeAssigneePrefix.length);
              return labelAssigneeName.toLowerCase() === currentFilters.assignee.toLowerCase();
            }
          }
          return false;
        });
        
        hasAssignee = normalAssigneeMatches || alternativeAssigneeMatches;
        if (!hasAssignee) {
          return false;
        }
      }
      
      // Apply unassigned filter if active
      if (currentFilters.showUnassignedOnly) {
        const assigneeImages = issue.querySelectorAll('img[alt], img[title]');
        const hasRealAssignee = Array.from(assigneeImages).some(img => {
          const name = img.getAttribute('alt') || img.getAttribute('title') || '';
          return name.trim() !== '';
        });
        
        if (hasRealAssignee) {
          return false;
        }
      }
      
      // Apply any existing label filters (for secondary label filtering)
      if (currentFilters.labels.length > 0) {
        const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
        const issueLabels = Array.from(labelLinks).map((link) => {
          const href = link.getAttribute("href");
          if (href && href.includes("label_name=")) {
            return decodeURIComponent(href.split("label_name=")[1]?.split("&")[0] || "");
          }
          return "";
        }).filter(label => label !== "");
        
        // Check if issue has ALL selected labels (AND logic)
        const allLabelsMatch = currentFilters.labels.every((selectedLabel) =>
          issueLabels.includes(selectedLabel)
        );
        
        if (!allLabelsMatch) {
          return false;
        }
      }
      
      return true;
    });
  }

  // Get all labels that appear on a given set of issues
  function getLabelsFromIssues(issues) {
    const labelSet = new Set();
    const alternativeAssigneePrefix = loadAlternativeAssigneePrefix();
    
    issues.forEach(issue => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      labelLinks.forEach(link => {
        const href = link.getAttribute("href");
        const labelSpan = link.querySelector(".gl-label-text");
        
        if (href && labelSpan) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            const labelName = decodeURIComponent(urlMatch[1]);
            const labelText = labelSpan.textContent.trim();
            
            // Skip alternative assignee labels
            if (!labelText.startsWith(alternativeAssigneePrefix)) {
              labelSet.add(labelName);
            }
          }
        }
      });
    });
    
    return Array.from(labelSet);
  }

  // Count how many of the currently filtered issues have a specific label
  function getSmartLabelCount(labelName, filteredIssues) {
    let count = 0;
    const alternativeAssigneePrefix = loadAlternativeAssigneePrefix();
    
    filteredIssues.forEach(issue => {
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      const hasLabel = Array.from(labelLinks).some(link => {
        const href = link.getAttribute("href");
        const labelSpan = link.querySelector(".gl-label-text");
        
        if (href && labelSpan) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            const issueLabelName = decodeURIComponent(urlMatch[1]);
            const labelText = labelSpan.textContent.trim();
            
            // Skip alternative assignee labels and check for match
            return !labelText.startsWith(alternativeAssigneePrefix) && issueLabelName === labelName;
          }
        }
        return false;
      });
      
      if (hasLabel) {
        count++;
      }
    });
    
    return count;
  }

  function applySmartLabelFiltering() {
    // Get all currently filtered/visible issues
    const filteredIssues = getFilteredIssuesForSmartFiltering();
    const relevantLabels = getLabelsFromIssues(filteredIssues);
    
    console.log(`Smart filtering: Found ${filteredIssues.length} filtered issues with ${relevantLabels.length} relevant labels`);
    
    // Hide/show labels based on relevance
    const allLabelItems = document.querySelectorAll('.label-item');
    allLabelItems.forEach(labelItem => {
      const labelName = labelItem.getAttribute('data-label-name');
      const isSelected = currentFilters.labels.includes(labelName);
      const isRelevant = relevantLabels.includes(labelName);
      
      // Always show selected labels, hide irrelevant unselected labels
      if (isSelected || isRelevant) {
        labelItem.style.display = 'flex';
      } else {
        labelItem.style.display = 'none';
      }
    });
  }

  function updateLabelCounts(labels) {
    // Check if Kanban board is active
    const kanbanBoard = document.querySelector("#kanban-board");
    const isKanbanActive = kanbanBoard && kanbanBoard.style.display !== "none";
    
    // Apply smart filtering if there are active filters
    const hasActiveFilters = currentFilters.assignee || currentFilters.labels.length > 0 || currentFilters.showUnassignedOnly;
    
    let filteredIssues = null;
    if (hasActiveFilters) {
      applySmartLabelFiltering();
      // Get filtered issues for smart counting
      filteredIssues = getFilteredIssuesForSmartFiltering();
    } else {
      // Show all labels when no filters are active
      const allLabelItems = document.querySelectorAll('.label-item');
      allLabelItems.forEach(labelItem => {
        labelItem.style.display = 'flex';
      });
    }
    
    labels.forEach((label) => {
      const labelItem = document.querySelector(
        `[data-label-name="${label.name}"]`
      );
      if (labelItem) {
        const countSpan = labelItem.querySelector(".issue-count");
        if (countSpan) {
          let count;

          if (hasActiveFilters && filteredIssues) {
            // Use smart counting based on currently filtered issues
            count = getSmartLabelCount(label.name, filteredIssues);
          } else if (isKanbanActive) {
            // For Kanban view with no filters: use the original label count
            count = label.count;
          } else {
            // For main view with no filters: use original count
            count = label.count;
          }

          countSpan.textContent = `(${count})`;

          // The visibility is already handled by applySmartLabelFiltering above
          // But we need to ensure selected labels are always visible
          const isSelectedLabel = currentFilters.labels.includes(label.name);
          if (isSelectedLabel) {
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
          '.issuable-row:not([style*="display: none"]), li.\\!gl-border-b-section:not([style*="display: none"]), li[class*="border"]:not([style*="display: none"])'
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
    const totalCount = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]').length;
    console.log(`GitLab Milestone Compass: Total issue count: ${totalCount}`);
    return totalCount;
  }

  function getUnassignedIssueCount() {
    const allIssues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
    let assignedCount = 0;
    
    allIssues.forEach((issue) => {
      // Method 1: Original GitLab structure
      const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
      if (assigneeIcon) {
        assignedCount++;
        return;
      }
      
      // Method 2: GitLab.com structure - check for any assignee images
      const assigneeImages = issue.querySelectorAll('.assignee-icon img');
      if (assigneeImages.length > 0) {
        assignedCount++;
      }
    });
    
    const unassignedCount = allIssues.length - assignedCount;
    console.log(`GitLab Milestone Compass: Unassigned issue count: ${unassignedCount} (total: ${allIssues.length}, assigned: ${assignedCount})`);
    return unassignedCount;
  }

  function getIssueCountForAssignee(assigneeName, isAlternative = false) {
    if (isAlternative) {
      // Count issues with the alternative assignee label
      const altAssigneePrefix = loadAlternativeAssigneePrefix();
      const expectedAltLabel = `${altAssigneePrefix}${assigneeName}`;
      
      const issues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
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
      // Support both GitLab DOM structures
      const issues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
      let count = 0;
      
      issues.forEach((issue) => {
        // Method 1: Original GitLab structure
        const assigneeIcon = issue.querySelector(`.assignee-icon a[title="Assigned to ${assigneeName}"]`);
        if (assigneeIcon) {
          count++;
          return;
        }
        
        // Method 2: GitLab.com structure
        const assigneeImages = issue.querySelectorAll('.assignee-icon img');
        const hasAssignee = Array.from(assigneeImages).some(img => 
          img.getAttribute('title') === `Assigned to ${assigneeName}` ||
          img.getAttribute('alt') === assigneeName
        );
        
        if (hasAssignee) count++;
      });
      
      console.log(`GitLab Milestone Compass: Counted ${count} issues for assignee "${assigneeName}"`);
      return count;
    }
  }

  function getFilteredIssueCountForAssignee(assigneeName, labelName) {
    const issues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
    let count = 0;

    issues.forEach((issue) => {
      let hasAssignee = false;
      
      // Method 1: Original GitLab structure
      const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
      if (assigneeIcon) {
        hasAssignee = assigneeIcon.getAttribute("title").includes(`Assigned to ${assigneeName}`);
      }
      
      // Method 2: GitLab.com structure
      if (!hasAssignee) {
        const assigneeImages = issue.querySelectorAll('.assignee-icon a img, .assignee-icon img');
        hasAssignee = Array.from(assigneeImages).some(img => {
          const title = img.getAttribute('title');
          const alt = img.getAttribute('alt');
          return (title && title.includes(`Assigned to ${assigneeName}`)) ||
                 (alt && alt === assigneeName);
        });
      }

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
    
    // Update current filters to include title search
    console.log(`[filterIssuesByTitle] Setting currentFilters.titleSearch to: "${searchTerm}"`);
    currentFilters.titleSearch = searchTerm;
    
    // Update persistent search state
    if (searchTerm.trim() !== "") {
      persistentSearchState = searchTerm;
      console.log(`[filterIssuesByTitle] Updated persistentSearchState to: "${persistentSearchState}"`);
    } else {
      persistentSearchState = "";
      console.log(`[filterIssuesByTitle] Cleared persistentSearchState`);
    }

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

    // Clear current filters title search
    console.log(`[clearTitleSearch] Clearing currentFilters.titleSearch (was: "${currentFilters.titleSearch || 'NOT SET'}")`);
    currentFilters.titleSearch = "";
    persistentSearchState = "";
    console.log(`[clearTitleSearch] Cleared persistentSearchState`);

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
    
    // Also clear Kanban search highlighting
    highlightKanbanSearchMatches("");

    // CRITICAL FIX: Apply Kanban filters if Kanban board is visible
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard && kanbanBoard.style.display !== "none") {
      console.log(`[clearTitleSearch] Kanban board is visible, applying filters after clearing search`);
      setTimeout(() => {
        applyKanbanFilters();
      }, 10);
    }

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
    
    // Ensure clean state transition - hide both views first
    hideKanbanBoard();
    hideStatusSections();
    
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
    // Ensure status sections are hidden
    hideStatusSections();
    
    // Show or create the Kanban board with a delay to ensure DOM is ready
    console.log("GitLab Milestone Compass: [showKanbanView] About to create Kanban board...");
    
    // Add a small delay to ensure DOM elements are fully rendered
    setTimeout(() => {
      console.log("GitLab Milestone Compass: [showKanbanView] Creating Kanban board after delay...");
      createKanbanBoard(0); // Start with retry count 0
    }, 200);
    
    // Note: Filter application is now handled within renderKanbanBoard() to avoid race conditions
    console.log("GitLab Milestone Compass: [showKanbanView] Kanban view setup complete - filters will be applied by renderKanbanBoard()");
  }

  function showStatusView() {    
    // Ensure Kanban board is hidden
    hideKanbanBoard();
    
    // Show the default status-based sections
    showStatusSections();
    
    // Apply search highlighting if there's an active search
    const searchInput = document.getElementById("issue-title-search");
    if (searchInput && searchInput.value.trim() !== "") {
      highlightSearchMatches(searchInput.value.trim());
    }
  }

  function hideStatusSections() {
    // Support both GitLab structures
    const sections = document.querySelectorAll("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed, #work_items-list-unassigned, #work_items-list-ongoing, #work_items-list-closed");
    sections.forEach(section => {
      const card = section.closest(".gl-card");
      if (card) card.style.display = "none";
    });
    
    // For GitLab.com: Also hide the entire row container
    const rowContainer = document.querySelector("#tab-issues .row.gl-mt-3");
    if (rowContainer) {
      rowContainer.style.display = "none";
      console.log("GitLab Milestone Compass: Hidden default status view (GitLab.com structure)");
    }
    
    // For original GitLab: Hide milestone content rows
    const milestoneRows = document.querySelectorAll(".milestone-content .row");
    milestoneRows.forEach(row => {
      if (row.querySelector("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed")) {
        row.style.display = "none";
        console.log("GitLab Milestone Compass: Hidden default status view (original GitLab structure)");
      }
    });
  }

  function showStatusSections() {
    // Support both GitLab structures
    const sections = document.querySelectorAll("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed, #work_items-list-unassigned, #work_items-list-ongoing, #work_items-list-closed");
    sections.forEach(section => {
      const card = section.closest(".gl-card");
      if (card) card.style.display = "block";
    });
    
    // For GitLab.com: Show the entire row container
    const rowContainer = document.querySelector("#tab-issues .row.gl-mt-3");
    if (rowContainer) {
      rowContainer.style.display = "flex";
      console.log("GitLab Milestone Compass: Shown default status view (GitLab.com structure)");
    }
    
    // For original GitLab: Show milestone content rows
    const milestoneRows = document.querySelectorAll(".milestone-content .row");
    milestoneRows.forEach(row => {
      if (row.querySelector("#issues-list-unassigned, #issues-list-ongoing, #issues-list-closed")) {
        row.style.display = "flex";
        console.log("GitLab Milestone Compass: Shown default status view (original GitLab structure)");
      }
    });
  }

  function hideKanbanBoard() {
    const kanbanBoard = document.querySelector("#kanban-board");
    if (kanbanBoard) {
      kanbanBoard.style.display = "none";
    }
  }

  function createKanbanBoard(retryCount = 0) {    
    console.log(`GitLab Milestone Compass: [createKanbanBoard] Starting Kanban board creation (attempt ${retryCount + 1})...`);
    
    // Check if required DOM elements exist
    const filterContainer = document.querySelector(".milestone-assignee-filter");
    const hasIssues = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]').length > 0;
    
    if (!filterContainer && retryCount < 5) {
      console.log("GitLab Milestone Compass: [createKanbanBoard] Filter container not found, retrying in 300ms...");
      setTimeout(() => createKanbanBoard(retryCount + 1), 300);
      return;
    }
    
    if (!hasIssues && retryCount < 5) {
      console.log("GitLab Milestone Compass: [createKanbanBoard] No issues found, retrying in 300ms...");
      setTimeout(() => createKanbanBoard(retryCount + 1), 300);
      return;
    }
    
    if (retryCount >= 5) {
      console.log("GitLab Milestone Compass: [createKanbanBoard] Max retries reached, giving up...");
      return;
    }
    
    console.log("GitLab Milestone Compass: [createKanbanBoard] DOM ready, proceeding with board creation...");
    
    // Build issue status mapping for reliable status detection
    buildIssueStatusMap();
    
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
    console.log("GitLab Milestone Compass: [createKanbanBoard] About to call renderKanbanBoard...");
    renderKanbanBoard(kanbanBoard);
    console.log("GitLab Milestone Compass: [createKanbanBoard] renderKanbanBoard completed.");
  }

  function createDefaultProfile(allLabels) {
    // Filter out alternative assignee labels and sort by count
    const altAssigneePrefix = loadAlternativeAssigneePrefix();
    const regularLabels = allLabels
      .filter(label => !label.name.startsWith(altAssigneePrefix))
      .sort((a, b) => b.count - a.count); // Sort by count descending
    
    // Take top 4 labels for the default profile
    const topLabels = regularLabels.slice(0, 4).map(label => label.name);
    
    if (topLabels.length === 0) {
      return null; // No labels available
    }
    
    const profileId = `default_${Date.now()}`;
    return {
      id: profileId,
      title: "DEFAULT",
      labels: topLabels
    };
  }

  function renderKanbanBoard(kanbanBoard) {
    console.log("GitLab Milestone Compass: [renderKanbanBoard] Function called, starting render...");
    
    const profiles = loadKanbanProfiles();
    const activeProfileId = loadActiveKanbanProfile();
    const config = loadKanbanConfig();
    const allLabels = extractLabels();
    
    console.log("GitLab Milestone Compass: [renderKanbanBoard] Config loaded:", { profilesCount: Object.keys(profiles).length, activeProfileId, configLabels: config, labelsCount: allLabels.length });  
    
    // If no profiles exist, create a default profile with top labels
    if (Object.keys(profiles).length === 0) {
      const defaultProfile = createDefaultProfile(allLabels);
      if (defaultProfile) {
        profiles[defaultProfile.id] = defaultProfile;
        saveKanbanProfiles(profiles);
        saveActiveKanbanProfile(defaultProfile.id);
        console.log(`Auto-created DEFAULT profile with ${defaultProfile.labels.length} top labels:`, defaultProfile.labels.join(', '));
        
        // Re-render with the new profile
        renderKanbanBoard(kanbanBoard);
        return;
      }
      
      // No labels available, show empty state
      kanbanBoard.innerHTML = `
        <div class="gl-card kanban-header">
          <div class="gl-card-header">
            <h3 class="gl-card-title">Kanban Board</h3>
            <div class="kanban-profile-chips">
              <!-- No profiles yet -->
            </div>
            <div class="kanban-header-controls">
              <label class="kanban-toggle hide-closed-toggle">
                <input type="checkbox" id="hide-closed-issues" />
                <span class="toggle-label">Hide Closed</span>
              </label>
              <div class="kanban-status-legend">
                <span class="legend-item">
                  <span class="legend-badge unstarted">U</span>
                  <span class="legend-text">Unstarted</span>
                </span>
                <span class="legend-item">
                  <span class="legend-badge ongoing">O</span>
                  <span class="legend-text">Ongoing</span>
                </span>
                <span class="legend-item">
                  <span class="legend-badge completed">C</span>
                  <span class="legend-text">Completed</span>
                </span>
              </div>
              <button class="btn btn-sm btn-default configure-kanban-btn">Configure Profiles</button>
            </div>
          </div>
        </div>
        <div class="kanban-empty-state">
          <div class="kanban-empty-content">
            <h4>Configure Your Kanban Board</h4>
            <p>Create profiles with different label combinations for your Kanban board.</p>
            <button class="btn btn-default btn-md configure-kanban-action">Create Profile</button>
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
      
      // Add hide closed issues toggle handler for empty state
      const hideClosedToggle = kanbanBoard.querySelector("#hide-closed-issues");
      if (hideClosedToggle) {
        const hideClosedState = loadHideClosedState();
        hideClosedToggle.checked = hideClosedState;
        
        hideClosedToggle.addEventListener("change", (e) => {
          const hideClosedIssues = e.target.checked;
          saveHideClosedState(hideClosedIssues);
          // No need to apply filter in empty state
        });
      }
      return;
    }
    
    // Render header with profile chips
    const profileChipsHtml = Object.values(profiles).map(profile => {
      const isActive = profile.id === activeProfileId;
      return `<span class="kanban-profile-chip ${isActive ? 'active' : ''}" data-profile-id="${profile.id}">${profile.title}</span>`;
    }).join('');
    
    const columnsHTML = renderKanbanColumns(config, allLabels);
    console.log(`GitLab Milestone Compass: Rendered Kanban columns HTML length:`, columnsHTML.length);
    console.log(`GitLab Milestone Compass: Columns HTML preview:`, columnsHTML.substring(0, 200) + '...');
    
    if (columnsHTML.length === 0) {
      console.log(`GitLab Milestone Compass: ERROR: No columns HTML generated!`);
      return;
    }
    
    kanbanBoard.innerHTML = `
      <div class="gl-card kanban-header">
        <div class="gl-card-header">
          <h3 class="gl-card-title">Kanban Board</h3>
          <div class="kanban-profile-chips">
            ${profileChipsHtml}
          </div>
          <div class="kanban-header-controls">
            <label class="kanban-toggle hide-closed-toggle">
              <input type="checkbox" id="hide-closed-issues" />
              <span class="toggle-label">Hide Closed</span>
            </label>
            <div class="kanban-status-legend">
              <span class="legend-item">
                <span class="legend-badge unstarted">U</span>
                <span class="legend-text">Unstarted</span>
              </span>
              <span class="legend-item">
                <span class="legend-badge ongoing">O</span>
                <span class="legend-text">Ongoing</span>
              </span>
              <span class="legend-item">
                <span class="legend-badge completed">C</span>
                <span class="legend-text">Completed</span>
              </span>
            </div>
            <button class="btn btn-sm btn-default configure-kanban-btn">Configure</button>
          </div>
        </div>
      </div>
      <div class="kanban-columns-container">
        ${columnsHTML}
      </div>
    `;
    
    console.log(`GitLab Milestone Compass: Kanban board HTML set. Checking container...`);
    const columnsContainer = kanbanBoard.querySelector('.kanban-columns-container');
    console.log(`GitLab Milestone Compass: Columns container found:`, !!columnsContainer);
    if (columnsContainer) {
      const columns = columnsContainer.querySelectorAll('.kanban-column');
      console.log(`GitLab Milestone Compass: Columns in DOM:`, columns.length);
      columns.forEach((col, index) => {
        const header = col.querySelector('.kanban-column-header span');
        const cards = col.querySelectorAll('.kanban-card');
        console.log(`GitLab Milestone Compass: Column ${index + 1}: "${header?.textContent}" with ${cards.length} cards`);
      });
      
      // Count total cards across all columns
      const totalCards = columnsContainer.querySelectorAll('.kanban-card');
      console.log(`GitLab Milestone Compass: Total cards in DOM immediately after HTML set:`, totalCards.length);
    } else {
      console.log(`GitLab Milestone Compass: ERROR: Columns container not found in DOM!`);
    }
    
    // Add configure button handler
    kanbanBoard.querySelector(".configure-kanban-btn").addEventListener("click", () => {
      showKanbanConfiguration(allLabels);
    });
    
    // Add hide closed issues toggle handler
    const hideClosedToggle = kanbanBoard.querySelector("#hide-closed-issues");
    if (hideClosedToggle) {
      // Load saved state
      const hideClosedState = loadHideClosedState();
      hideClosedToggle.checked = hideClosedState;
      
      hideClosedToggle.addEventListener("change", (e) => {
        const hideClosedIssues = e.target.checked;
        saveHideClosedState(hideClosedIssues);
        applyKanbanFilters();
        
        // Apply search highlighting after filters
        const searchInput = document.getElementById("issue-title-search");
        if (searchInput && searchInput.value.trim() !== "") {
          setTimeout(() => {
            highlightKanbanSearchMatches(searchInput.value.trim());
          }, 50);
        }
      });
      
      // Ensure search state is transferred to Kanban view
      const searchInput = document.getElementById("issue-title-search");
      if (searchInput && searchInput.value.trim() !== "") {
        currentFilters.titleSearch = searchInput.value;
      }
      
      // Apply initial filters (always run to ensure correct visibility)
      // Add small delay to ensure DOM has been updated with the new HTML
      setTimeout(() => {
        console.log("GitLab Milestone Compass: [renderKanbanBoard] Applying filters after DOM update...");
        applyKanbanFilters();
      }, 50);
      
      // Apply initial search highlighting if there's an active search
      if (searchInput && searchInput.value.trim() !== "") {
        setTimeout(() => {
          highlightKanbanSearchMatches(searchInput.value.trim());
        }, 150); // Increased to account for the 50ms filter delay
      }
    }
    
    // Add cross-column highlighting for duplicate issues
    setupCrossColumnHighlighting(kanbanBoard);
    
    // Add profile chip handlers
    const profileChips = kanbanBoard.querySelectorAll(".kanban-profile-chip");
    profileChips.forEach(chip => {
      chip.addEventListener("click", () => {
        const profileId = chip.dataset.profileId;
        switchKanbanProfile(profileId);
      });
    });
    
    // Final debug check
    console.log(`GitLab Milestone Compass: [FINAL CHECK] Kanban board setup complete`);
    const finalColumnsContainer = kanbanBoard.querySelector('.kanban-columns-container');
    if (finalColumnsContainer) {
      const finalColumns = finalColumnsContainer.querySelectorAll('.kanban-column');
      console.log(`GitLab Milestone Compass: [FINAL CHECK] Final column count in DOM:`, finalColumns.length);
      console.log(`GitLab Milestone Compass: [FINAL CHECK] Kanban board display style:`, kanbanBoard.style.display);
      console.log(`GitLab Milestone Compass: [FINAL CHECK] Columns container display style:`, finalColumnsContainer.style.display);
      finalColumns.forEach((col, index) => {
        const isHidden = col.style.display === 'none';
        const headerText = col.querySelector('.kanban-column-header span')?.textContent || 'Unknown';
        console.log(`GitLab Milestone Compass: [FINAL CHECK] Column ${index + 1} "${headerText}": ${isHidden ? 'HIDDEN' : 'VISIBLE'}`);
      });
    } else {
      console.log(`GitLab Milestone Compass: [FINAL CHECK] ERROR: Columns container not found!`);
    }
  }

  function setupCrossColumnHighlighting(kanbanBoard) {
    const kanbanCards = kanbanBoard.querySelectorAll('.kanban-card[data-issue-number]');
    
    kanbanCards.forEach(card => {
      const issueNumber = card.getAttribute('data-issue-number');
      
      // Skip cards without issue numbers
      if (!issueNumber) return;
      
      card.addEventListener('mouseenter', () => {
        highlightDuplicateIssues(kanbanBoard, issueNumber, true);
      });
      
      card.addEventListener('mouseleave', () => {
        highlightDuplicateIssues(kanbanBoard, issueNumber, false);
      });
    });
  }

  function highlightDuplicateIssues(kanbanBoard, issueNumber, highlight) {
    const allCards = kanbanBoard.querySelectorAll(`[data-issue-number="${issueNumber}"]`);
    
    allCards.forEach(card => {
      if (highlight) {
        card.classList.add('duplicate-highlighted');
      } else {
        card.classList.remove('duplicate-highlighted');
      }
    });
  }

  function switchKanbanProfile(profileId) {
    const profiles = loadKanbanProfiles();
    if (profiles[profileId]) {
      saveActiveKanbanProfile(profileId);
      
      const kanbanBoard = document.getElementById("kanban-board");
      if (kanbanBoard) {
        // Clear the board completely before re-rendering to prevent accumulation
        kanbanBoard.innerHTML = '';
        renderKanbanBoard(kanbanBoard);
      }
    } else {
      console.error(`Profile ${profileId} not found in:`, profiles);
    }
  }

  function renderKanbanColumns(config, allLabels) {
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] Starting with config:`, config);
    
    // Get fresh DOM selection every time, but EXCLUDE any existing Kanban cards to prevent duplicates
    const allIssueElements = document.querySelectorAll('.issuable-row, li.\\!gl-border-b-section, li[class*="border"]');
    const allIssues = Array.from(allIssueElements).filter(issue => {
      // Exclude any issues that are already in Kanban cards to prevent duplication
      return !issue.classList.contains('kanban-card');
    });
    
    console.log(`GitLab Milestone Compass: Found ${allIssues.length} issues for Kanban board`);
    console.log("GitLab Milestone Compass: Issue elements found:", allIssues.map(issue => ({
      element: issue.tagName + '.' + issue.className,
      title: issue.querySelector('a.gl-text-default, span > a[title]')?.textContent?.trim() || 'No title',
      url: issue.querySelector('a[href*="/issues/"]')?.href || 'No URL'
    })));
    
    let columns = "";
    let usedIssues = new Set(); // Track issues already placed in columns
    
    // Create columns for configured labels (only if they have issues)
    console.log(`GitLab Milestone Compass: Kanban config labels:`, config);
    console.log(`GitLab Milestone Compass: Available labels:`, allLabels.map(l => ({ name: l.name, text: l.text, count: l.count })));
    
    config.forEach(labelName => {
      const label = allLabels.find(l => l.name === labelName);
      console.log(`GitLab Milestone Compass: Processing label "${labelName}":`, label ? 'found' : 'NOT FOUND');
      
      if (label) {
        const issues = getFilteredIssuesForKanbanLabel(labelName, allIssues);
        console.log(`GitLab Milestone Compass: Issues for label "${labelName}":`, issues.length);
        
        // Only create column if it has issues
        if (issues.length > 0) {
          columns += createKanbanColumn(label, issues);
          // Track these issues as used to prevent duplicates in MISC
          issues.forEach(issue => {
            const issueUrl = getIssueUrlFromElement(issue);
            if (issueUrl) {
              usedIssues.add(issueUrl);
              console.log(`GitLab Milestone Compass: Marked issue as used: ${issueUrl}`);
            }
          });
          console.log(`GitLab Milestone Compass: Created column for "${labelName}" with ${issues.length} issues. Total used: ${usedIssues.size}`);
        } else {
          console.log(`GitLab Milestone Compass: No issues found for label "${labelName}", skipping column`);
        }
      } else {
        console.log(`GitLab Milestone Compass: Label "${labelName}" not found in available labels`);
      }
    });
    
    // Add MISC column for ALL issues not in any other column (NO LIMITS)
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] Creating unlimited MISC column...`);
    const remainingIssues = allIssues.filter(issue => {
      const issueUrl = getIssueUrlFromElement(issue);
      return issueUrl && !usedIssues.has(issueUrl);
    });
    
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] Found ${remainingIssues.length} remaining issues for MISC (NO LIMIT)`);
    
    if (remainingIssues.length > 0) {
      columns += createMiscColumn(remainingIssues);
      console.log(`GitLab Milestone Compass: [renderKanbanColumns] MISC column created with ALL ${remainingIssues.length} remaining issues`);
    }
    
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] Generated columns HTML (${columns.length} chars)`);
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] HTML preview:`, columns.substring(0, 300) + '...');
    console.log(`GitLab Milestone Compass: [renderKanbanColumns] RETURNING columns HTML now...`);
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

  function getIssueStatus(issue) {
    // Get issue URL for debugging
    const issueLink = issue.querySelector('a[href*="/issues/"]');
    const issueUrl = issueLink ? issueLink.href : 'unknown';
    
    // Strategy 0: Check the pre-built status mapping (most reliable)
    if (issueStatusMap.has(issueUrl)) {
      const mappedStatus = issueStatusMap.get(issueUrl);
      return mappedStatus;
    }
    
    // Strategy 1: Check if the issue appears visually closed/struck through
    const titleLink = issue.querySelector('.issuable-info a, .issue-title-text a, span > a[title]');
    if (titleLink) {
      const titleStyle = window.getComputedStyle(titleLink);
      const textDecoration = titleStyle.textDecoration;
      
      // Check for strikethrough indicating closed issue
      if (textDecoration.includes('line-through')) {
        return 'completed';
      }
    }
    
    // Strategy 1: Check for GitLab's specific closed status indicators
    // Look for GitLab's standard status badges and state indicators
    const statusBadge = issue.querySelector('.gl-badge, .badge, .issuable-status, .issue-status');
    if (statusBadge) {
      const badgeText = statusBadge.textContent.toLowerCase().trim();
      const badgeClasses = statusBadge.className.toLowerCase();
      
      // Check for closed/completed indicators
      if (badgeText.includes('closed') || 
          badgeText.includes('completed') || 
          badgeText.includes('done') ||
          badgeClasses.includes('closed') ||
          badgeClasses.includes('state-closed')) {
        return 'completed';
      }
    }
    
    // Strategy 2: Check GitLab's data attributes and classes on the issue row
    const dataState = issue.getAttribute('data-state');
    const dataStatus = issue.getAttribute('data-status');
    
    if (dataState === 'closed' || dataStatus === 'closed') {
      return 'completed';
    }
    
    // Strategy 3: Check for closed state in CSS classes on the issue element
    const issueClasses = issue.className.toLowerCase();
    if (issueClasses.includes('closed') || 
        issueClasses.includes('state-closed') ||
        issueClasses.includes('issuable-closed')) {
      return 'completed';
    }
    
    // Strategy 4: Look for GitLab's typical closed issue visual indicators
    const closedIcon = issue.querySelector('.fa-check, .fa-check-circle, .gl-icon[name="issue-closed"], [data-testid="issue-closed-icon"]');
    if (closedIcon) {
      return 'completed';
    }
    
    // Strategy 5: Check for closed text in issue metadata
    const issueInfo = issue.querySelector('.issuable-info, .issuable-meta, .issue-meta, .issuable-info-container');
    if (issueInfo) {
      const infoText = issueInfo.textContent.toLowerCase();
      if (infoText.includes('closed') || infoText.includes('completed')) {
        return 'completed';
      }
    }
    
    // Strategy 6: Check the entire issue row for closed indicators (last resort)
    const issueText = issue.textContent.toLowerCase();
    const issueHTML = issue.outerHTML.toLowerCase();
    
    // Be more specific about closed indicators to avoid false positives
    const strictClosedPatterns = [
      'state.*closed',
      'status.*closed', 
      'issue.*closed',
      'closed.*issue'
    ];
    
    const hasStrictClosedPattern = strictClosedPatterns.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(issueHTML) || regex.test(issueText);
    });
    
    if (hasStrictClosedPattern) {
      return 'completed';
    }
    
    // Strategy 7: Check if issue is in a "closed" or "completed" section
    const parentSection = issue.closest('.gl-card, .issuable-list, [id*="closed"], [id*="completed"]');
    if (parentSection) {
      const sectionId = parentSection.id || '';
      const sectionClasses = parentSection.className || '';
      
      if (sectionId.includes('closed') || sectionId.includes('completed') ||
          sectionClasses.includes('closed') || sectionClasses.includes('completed')) {
        return 'completed';
      }
    }
    
    // Strategy 8: Look for GitLab's specific closed issue indicators more broadly
    const allElements = issue.querySelectorAll('*');
    for (const element of allElements) {
      const elementText = element.textContent.toLowerCase();
      const elementClasses = element.className.toLowerCase();
      
      // Look for GitLab's typical closed indicators
      if ((elementText.includes('closed') || elementClasses.includes('closed')) &&
          (elementText.includes('issue') || elementClasses.includes('issue') || 
           elementClasses.includes('state') || elementClasses.includes('status'))) {
        return 'completed';
      }
    }
    
    // Strategy 9: Check the original status-based sections to determine if issue was in closed section
    const allIssues = document.querySelectorAll('.issuable-row');
    const closedSection = document.querySelector('#issues-list-closed');
    
    if (closedSection) {
      const closedIssues = closedSection.querySelectorAll('.issuable-row');
      const isInClosedSection = Array.from(closedIssues).some(closedIssue => {
        // Compare issue URLs or other unique identifiers
        const closedIssueLink = closedIssue.querySelector('a[href*="/issues/"]');
        const currentIssueLink = issue.querySelector('a[href*="/issues/"]');
        if (closedIssueLink && currentIssueLink) {
          return closedIssueLink.href === currentIssueLink.href;
        }
        return false;
      });
      
      if (isInClosedSection) {
        return 'completed';
      }
    }
    
    // Strategy 10: Check for absence of "open" indicators (GitLab sometimes only shows open state)
    const openIndicators = issue.querySelectorAll('.state-opened, [data-state="opened"], .issue-state-open, .gl-badge-success');
    
    // If we found specific "open" indicators and this issue doesn't have them, it might be closed
    // But this is less reliable, so we'll be conservative here
    
    // Now check for assignee (ongoing vs unstarted)
    const assigneeSelectors = [
      '.assignee-icon img',
      '.issuable-assignees img', 
      '.assignee img',
      '[data-assignee-id]:not([data-assignee-id=""])',
      '.author-link img',
      '.assignee-link'
    ];
    
    let assigneeFound = false;
    for (const selector of assigneeSelectors) {
      const element = issue.querySelector(selector);
      if (element) {
        if (element.src && !element.src.includes('default') && !element.src.includes('placeholder')) {
          assigneeFound = true;
          break;
        }
      }
    }
    
    if (assigneeFound) {
      return 'ongoing';
    }
    
    return 'unstarted';
  }

  // Issue status mapping for reliable status detection
  let issueStatusMap = new Map();

  function buildIssueStatusMap() {
    issueStatusMap.clear();
    
    console.log("GitLab Milestone Compass: Building issue status map...");
    
    // Method 1: Original GitLab structure
    // Map issues from unstarted section
    let unassignedSection = document.querySelector('#issues-list-unassigned');
    if (unassignedSection) {
      const unassignedIssues = unassignedSection.querySelectorAll('.issuable-row');
      unassignedIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'unstarted');
        }
      });
    }
    
    // Map issues from ongoing section  
    let ongoingSection = document.querySelector('#issues-list-ongoing');
    if (ongoingSection) {
      const ongoingIssues = ongoingSection.querySelectorAll('.issuable-row');
      ongoingIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'ongoing');
        }
      });
    }
    
    // Map issues from closed section
    let closedSection = document.querySelector('#issues-list-closed');
    if (closedSection) {
      const closedIssues = closedSection.querySelectorAll('.issuable-row');
      closedIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'completed');
        }
      });
    }
    
    // Method 2: GitLab.com structure with work_items-list
    // Map issues from unstarted section
    unassignedSection = document.querySelector('#work_items-list-unassigned');
    if (unassignedSection) {
      const unassignedIssues = unassignedSection.querySelectorAll('li');
      unassignedIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'unstarted');
          console.log("GitLab Milestone Compass: Mapped unstarted issue:", link.href);
        }
      });
    }
    
    // Map issues from ongoing section  
    ongoingSection = document.querySelector('#work_items-list-ongoing');
    if (ongoingSection) {
      const ongoingIssues = ongoingSection.querySelectorAll('li');
      ongoingIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'ongoing');
          console.log("GitLab Milestone Compass: Mapped ongoing issue:", link.href);
        }
      });
    }
    
    // Map issues from closed section
    closedSection = document.querySelector('#work_items-list-closed');
    if (closedSection) {
      const closedIssues = closedSection.querySelectorAll('li');
      closedIssues.forEach(issue => {
        const link = issue.querySelector('a[href*="/issues/"]');
        if (link) {
          issueStatusMap.set(link.href, 'completed');
          console.log("GitLab Milestone Compass: Mapped completed issue:", link.href);
        }
      });
    }
    
    console.log("GitLab Milestone Compass: Issue status map built with", issueStatusMap.size, "issues");
  }

  // Helper functions for hide closed issues feature
  function loadHideClosedState() {
    const milestoneKey = getMilestoneKey();
    return localStorage.getItem(`hideClosedIssues_${milestoneKey}`) === 'true';
  }

  function saveHideClosedState(hideClosedIssues) {
    const milestoneKey = getMilestoneKey();
    localStorage.setItem(`hideClosedIssues_${milestoneKey}`, hideClosedIssues.toString());
  }

  function applyKanbanFilters() {
    
    const hideClosedState = loadHideClosedState();
    const alternativeAssigneePrefix = loadAlternativeAssigneePrefix(); // Load once at the start
    const kanbanCards = document.querySelectorAll('.kanban-card');
    
    const kanbanBoard = document.querySelector('#kanban-board');
    
    // Check if there's an active search - try multiple selectors
    let searchInput = document.getElementById("issue-title-search");
    if (!searchInput) {
      searchInput = document.querySelector("input[placeholder*='Search issue titles']");
    }
    if (!searchInput) {
      searchInput = document.querySelector(".issue-search-input");
    }
    if (!searchInput) {
      searchInput = document.querySelector("input[type='text'][placeholder*='issue']");
    }
        
    // CRITICAL FIX: Always sync search state before applying filters
    const inputSearchTerm = searchInput ? searchInput.value.trim() : "";
    if (inputSearchTerm && inputSearchTerm !== currentFilters.titleSearch) {      
      currentFilters.titleSearch = inputSearchTerm;
      persistentSearchState = inputSearchTerm;
    }
    
    // Determine if there's an active search from multiple sources
    const filterSearchTerm = currentFilters.titleSearch || "";
    const persistentSearchTerm = persistentSearchState || "";
    
    // Use the most specific search term available
    const activeSearchTerm = inputSearchTerm || filterSearchTerm || persistentSearchTerm;
    const hasActiveSearch = activeSearchTerm !== "";
    const searchTerms = hasActiveSearch ? activeSearchTerm.toLowerCase().split(/\s+/).filter(term => term.length > 0) : [];      
    
    // If search input exists but currentFilters.titleSearch is not set, set it
    if (hasActiveSearch && (!currentFilters.titleSearch || currentFilters.titleSearch !== searchInput.value)) {      
      currentFilters.titleSearch = searchInput.value;
    }
    
    
    kanbanCards.forEach((card, index) => {
      let shouldShow = true;
      
      // Get card title for debugging
      const titleLink = card.querySelector('.kanban-card-title a');
      const title = titleLink ? titleLink.textContent.toLowerCase() : 'NO TITLE';
      
      // Get issue URL to find the original issue element
      const issueUrl = card.getAttribute('data-issue-url');
      let originalIssue = null;
      
      console.log(`GitLab Milestone Compass: [applyKanbanFilters] Looking for original issue with URL: ${issueUrl}`);
      
      if (issueUrl) {
        // Debug: List all available issue links in DOM
        const allIssueLinks = document.querySelectorAll('a[href*="/issues/"]');
        console.log(`GitLab Milestone Compass: [applyKanbanFilters] Found ${allIssueLinks.length} issue links in DOM`);
        
        // Try multiple selectors for different GitLab versions
        originalIssue = document.querySelector(`[href="${issueUrl}"]`)?.closest('li, .issuable-row') ||
                      document.querySelector(`[href*="${issueUrl}"]`)?.closest('li, .issuable-row');
        
        if (!originalIssue) {
          console.log(`GitLab Milestone Compass: [applyKanbanFilters] Could not find original issue for exact URL: ${issueUrl}`);
          
          // Try a more flexible search by issue number
          const issueNumMatch = issueUrl.match(/\/issues\/(\d+)/);
          if (issueNumMatch) {
            const issueNum = issueNumMatch[1];
            console.log(`GitLab Milestone Compass: [applyKanbanFilters] Trying to find issue #${issueNum}...`);
            
            // Look for any link containing this issue number
            originalIssue = document.querySelector(`[href*="/issues/${issueNum}"]`)?.closest('li, .issuable-row, .!gl-border-b-section');
            
            if (originalIssue) {
              console.log(`GitLab Milestone Compass: [applyKanbanFilters] ✅ Found original issue via issue number: ${issueNum}`);
            } else {
              console.log(`GitLab Milestone Compass: [applyKanbanFilters] ❌ Still could not find issue #${issueNum}`);
              
              // Debug: Show first few available issue URLs
              const sampleUrls = Array.from(allIssueLinks).slice(0, 3).map(link => link.getAttribute('href'));
              console.log(`GitLab Milestone Compass: [applyKanbanFilters] Sample available URLs:`, sampleUrls);
            }
          }
        } else {
          console.log(`GitLab Milestone Compass: [applyKanbanFilters] ✅ Found original issue via exact URL match`);
        }
      }
      
      // Apply assignee filter (same logic as main view)
      if (shouldShow && currentFilters.assignee) {
        let normalAssigneeMatches = false;
        let alternativeAssigneeMatches = false;
        
        // Check normal assignees first
        if (originalIssue) {
          const assigneeImages = originalIssue.querySelectorAll('img[alt], img[title]');
          normalAssigneeMatches = Array.from(assigneeImages).some(img => {
            const name = img.getAttribute('alt') || img.getAttribute('title') || '';
            return name.toLowerCase().includes(currentFilters.assignee.toLowerCase());
          });
        }
        
        // FALLBACK: Get normal assignee from Kanban card
        if (!normalAssigneeMatches) {
          const cardAssignee = card.querySelector('.kanban-card-assignee span');
          if (cardAssignee) {
            const assigneeName = cardAssignee.textContent.trim();
            normalAssigneeMatches = assigneeName.toLowerCase().includes(currentFilters.assignee.toLowerCase());
          }
        }
        
        // Check alternative assignee labels - use Kanban card (most reliable)
        const cardLabels = card.querySelectorAll('.kanban-card-labels .kanban-label-clone');
        alternativeAssigneeMatches = Array.from(cardLabels).some(label => {
          const labelText = label.textContent.trim();
          if (labelText.startsWith(alternativeAssigneePrefix)) {
            const labelAssigneeName = labelText.substring(alternativeAssigneePrefix.length);
            return labelAssigneeName.toLowerCase() === currentFilters.assignee.toLowerCase();
          }
          return false;
        });
        
        // Simple test - log when we're filtering for alternative assignees
        if (currentFilters.assignee && (currentFilters.assignee === 'dev1' || currentFilters.assignee === 'dev2' || currentFilters.assignee === 'dev3')) {
          console.log(`🔧 ALT ASSIGNEE: Card "${title}" - Looking for "${currentFilters.assignee}", found alt match: ${alternativeAssigneeMatches}, will ${(!normalAssigneeMatches && !alternativeAssigneeMatches) ? 'HIDE' : 'SHOW'}`);
        }
        
        if (!normalAssigneeMatches && !alternativeAssigneeMatches) {
          shouldShow = false;
        }
      }
      
      // Apply unassigned-only filter
      if (shouldShow && currentFilters.showUnassignedOnly) {
        let hasRealAssignee = false;
        
        // Check if card has a real GitLab assignee (not alternative assignee)
        if (originalIssue) {
          const assigneeImages = originalIssue.querySelectorAll('img[alt], img[title]');
          hasRealAssignee = Array.from(assigneeImages).some(img => {
            const name = img.getAttribute('alt') || img.getAttribute('title') || '';
            return name.trim() !== '';
          });
        }
        
        // FALLBACK: Check Kanban card for real assignee
        if (!hasRealAssignee) {
          const cardAssignee = card.querySelector('.kanban-card-assignee span');
          hasRealAssignee = cardAssignee && cardAssignee.textContent.trim() !== '';
        }
        
        // Hide cards that have real assignees when "unassigned only" filter is active
        if (hasRealAssignee) {
          shouldShow = false;
        }
      }
      
      // Apply label filter - check if card has ANY of the selected labels
      if (shouldShow && currentFilters.labels.length > 0) {
        let cardLabels = [];
        
        if (originalIssue) {
          // Try to get labels from original issue
          const labelLinks = originalIssue.querySelectorAll(".gl-label .gl-label-link");
          
          const allLabelsFromOriginal = Array.from(labelLinks).map((link) => {
            const href = link.getAttribute("href");
            if (href && href.includes("label_name=")) {
              return decodeURIComponent(
                href.split("label_name=")[1]?.split("&")[0] || ""
              );
            }
            return "";
          }).filter(label => label !== "");
          
          // Filter OUT alternative assignee labels - they should not be treated as regular labels
          cardLabels = allLabelsFromOriginal.filter(label => !label.startsWith(alternativeAssigneePrefix));
        }
        
        // ALWAYS try fallback method as well (get labels from Kanban card)
        if (cardLabels.length === 0) {
          const cardLabelElements = card.querySelectorAll('.kanban-card-labels .kanban-label-clone');
          const allCardLabels = Array.from(cardLabelElements).map(label => label.textContent.trim());
          
          // Filter OUT alternative assignee labels - they should not be treated as regular labels
          cardLabels = allCardLabels.filter(label => !label.startsWith(alternativeAssigneePrefix));
        }
        
        // CRITICAL: Add the column's label as an implicit label for this card
        // Every card in a column should be considered to have that column's label
        const column = card.closest('.kanban-column');
        const columnLabel = column ? column.getAttribute('data-label') : null;
        
        if (columnLabel && !cardLabels.includes(columnLabel)) {
          cardLabels.push(columnLabel);
        }
        

        
        // Normalize both selected labels and card labels for comparison
        // Handle URL encoding differences (e.g., "help+wanted" vs "help wanted")
        const normalizedSelectedLabels = currentFilters.labels.map(label => 
          decodeURIComponent(label.replace(/\+/g, ' '))
        );
        const normalizedCardLabels = cardLabels.map(label => 
          decodeURIComponent(label.replace(/\+/g, ' '))
        );
        

        
        // Check if card has ANY of the selected labels (OR logic for multiple selected labels)
        const hasSelectedLabel = normalizedSelectedLabels.some(selectedLabel => 
          normalizedCardLabels.includes(selectedLabel)
        );
        
        if (!hasSelectedLabel) {
          shouldShow = false;
        }
      }
      
      // Check search filter
      if (shouldShow && hasActiveSearch) {
        if (titleLink) {
          const matchesSearch = searchTerms.every(term => title.includes(term));
          if (!matchesSearch) {
            shouldShow = false;
          }
        } else {
          shouldShow = false;
        }
      } 
      
      // Apply hide closed filter
      if (shouldShow && hideClosedState) {
        const statusBadge = card.querySelector('.kanban-status-badge');
        if (statusBadge && statusBadge.textContent.trim() === 'C') {
          // Hide closed issues when hide closed toggle is enabled
          shouldShow = false;
        }
      }
      
      card.style.display = shouldShow ? '' : 'none';
    });
    
    // Update column counts after applying filter
    console.log(`GitLab Milestone Compass: [applyKanbanFilters] About to update column counts...`);
    updateKanbanColumnCounts();
    console.log(`GitLab Milestone Compass: [applyKanbanFilters] Filters applied and column counts updated.`);
    
    // Final check on column visibility
    const columns = document.querySelectorAll('.kanban-column');
    console.log(`GitLab Milestone Compass: [applyKanbanFilters] Final column visibility check: ${columns.length} total columns`);
    columns.forEach((col, index) => {
      const isHidden = col.style.display === 'none';
      const headerText = col.querySelector('.kanban-column-header span')?.textContent || 'Unknown';
      const visibleCards = col.querySelectorAll('.kanban-card:not([style*="display: none"])').length;
      console.log(`GitLab Milestone Compass: [applyKanbanFilters] Column ${index + 1} "${headerText}": ${isHidden ? 'HIDDEN' : 'VISIBLE'}, ${visibleCards} visible cards`);
    });
  }

  // Keep the old name for backward compatibility
  function applyHideClosedFilter() {
    applyKanbanFilters();
  }

  function updateKanbanColumnCounts() {
    const columns = document.querySelectorAll('.kanban-column');
    console.log(`GitLab Milestone Compass: [updateKanbanColumnCounts] Processing ${columns.length} columns`);
    
    columns.forEach((column, index) => {
      const totalCards = column.querySelectorAll('.kanban-card');
      const visibleCards = column.querySelectorAll('.kanban-card:not([style*="display: none"])');
      const headerText = column.querySelector('.kanban-column-header span')?.textContent || 'Unknown';
      
      console.log(`GitLab Milestone Compass: [updateKanbanColumnCounts] Column ${index + 1} "${headerText}": ${totalCards.length} total, ${visibleCards.length} visible`);
      
      const countElement = column.querySelector('.kanban-count');
      if (countElement) {
        countElement.textContent = `(${visibleCards.length})`;
      }
      
      // Hide empty columns to avoid unnecessary horizontal scrolling
      const shouldHideColumn = visibleCards.length === 0;
      const isCurrentlyHidden = column.style.display === 'none';
      
      console.log(`GitLab Milestone Compass: [updateKanbanColumnCounts] Column "${headerText}" shouldHide: ${shouldHideColumn}, currentlyHidden: ${isCurrentlyHidden}`);
      
      // Only change visibility if it's different from current state (reduces flickering)
      if (shouldHideColumn && !isCurrentlyHidden) {
        column.style.display = 'none';
        console.log(`GitLab Milestone Compass: [updateKanbanColumnCounts] HIDING column "${headerText}" because it has 0 visible cards`);
      } else if (!shouldHideColumn && isCurrentlyHidden) {
        column.style.display = '';
        console.log(`GitLab Milestone Compass: [updateKanbanColumnCounts] SHOWING column "${headerText}" because it has ${visibleCards.length} visible cards`);
      }
    });
  }

  function createKanbanCard(issue, currentColumnLabel = null) {
    console.log(`GitLab Milestone Compass: [createKanbanCard] Creating card for column "${currentColumnLabel}"`);
    
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
        
        // Clean up title text and remove repeated issue numbers
        title = title.replace(/\s+/g, ' ').trim();
        
        // Remove repeated issue numbers pattern (e.g., "#171 #171 #171..." becomes "#171")
        // First, find all issue number patterns and deduplicate them
        const issueNumberMatches = title.match(/#\d+/g);
        if (issueNumberMatches && issueNumberMatches.length > 1) {
          // Remove all issue numbers first
          let cleanTitle = title.replace(/#\d+\s*/g, '').trim();
          // Add back only the first unique issue number
          const uniqueIssueNumber = issueNumberMatches[0];
          title = `${uniqueIssueNumber} ${cleanTitle}`.trim();
        }
        
        if (title && title !== "" && title !== "Unknown Issue") {
          break;
        }
      }
    }
    
    // If still no good title, try to extract from any text content in the issue
    if (title === "Unknown Issue") {
      const textContent = issue.textContent.trim();
      if (textContent) {
        // Extract first meaningful line as title, but clean up repeated issue numbers
        const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 5);
        if (lines.length > 0) {
          let cleanTitle = lines[0].substring(0, 100); // Limit to 100 chars
          
          // Remove repeated issue numbers (like "#171 #171 #171...")
          const issueNumberMatches = cleanTitle.match(/#\d+/g);
          if (issueNumberMatches && issueNumberMatches.length > 1) {
            // Remove all issue numbers first
            let tempTitle = cleanTitle.replace(/#\d+\s*/g, '').trim();
            // Add back only the first unique issue number
            const uniqueIssueNumber = issueNumberMatches[0];
            cleanTitle = `${uniqueIssueNumber} ${tempTitle}`.trim();
          }
          
          // If the cleaned title is mostly just issue numbers, try the next line
          if (cleanTitle.match(/^(#\d+\s*)+/) && lines.length > 1) {
            cleanTitle = lines[1].substring(0, 100);
            // Apply same cleaning to the second line
            const issueNumberMatches2 = cleanTitle.match(/#\d+/g);
            if (issueNumberMatches2 && issueNumberMatches2.length > 1) {
              let tempTitle = cleanTitle.replace(/#\d+\s*/g, '').trim();
              const uniqueIssueNumber = issueNumberMatches2[0];
              cleanTitle = `${uniqueIssueNumber} ${tempTitle}`.trim();
            }
          }
          
          title = cleanTitle;
        }
      }
    }
    
    // Extract issue number from the link, title, or issue element
    let issueNumber = "";
    
    // Check if title already starts with an issue number
    const titleStartsWithNumber = title.match(/^#\d+\s/);
    
    if (!titleStartsWithNumber) {
      // Only add issue number if title doesn't already have one
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
    }
    
    // Get ONLY real GitLab assignees (NEVER alternative assignees) - Support both GitLab versions
    let assigneeName = null;
    let assigneeAvatar = null;
    
    // Try GitLab.com structure first
    const assigneeImg = issue.querySelector('img[alt]:not([alt=""]), img[title]:not([title=""])');
    if (assigneeImg) {
      assigneeName = assigneeImg.getAttribute('alt') || assigneeImg.getAttribute('title');
      assigneeAvatar = assigneeImg.getAttribute('src');
    }
    
    // Fallback to original GitLab structure
    if (!assigneeName) {
      const assigneeIcon = issue.querySelector('.assignee-icon a[title*="Assigned to"]');
      if (assigneeIcon) {
        assigneeName = assigneeIcon.getAttribute("title").replace("Assigned to ", "");
        assigneeAvatar = assigneeIcon.querySelector("img")?.getAttribute("src");
      }
    }
    
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
    
    // Get issue status for badge
    const status = getIssueStatus(issue);
    const statusConfig = {
      'unstarted': { text: 'U', color: '#6b7280', title: 'Unstarted' },
      'ongoing': { text: 'O', color: '#3b82f6', title: 'Ongoing' },
      'completed': { text: 'C', color: '#10b981', title: 'Completed' }
    };
    const statusInfo = statusConfig[status];
    
    // Debug logging to help identify status detection issues
    const issueTitle = title.substring(0, 50);
    
    // Extract issue number for duplicate highlighting
    const issueNumMatch = (issueNumber + title).match(/#(\d+)/);
    const extractedIssueNum = issueNumMatch ? issueNumMatch[1] : "";

    const cardHTML = `
      <div class="issuable-row kanban-card" data-issue-url="${link}" data-issue-number="${extractedIssueNum}">
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
        <div class="kanban-status-badge" style="background-color: ${statusInfo.color};" title="${statusInfo.title}">
          ${statusInfo.text}
        </div>
      </div>
    `;
    
    console.log(`GitLab Milestone Compass: [createKanbanCard] Created card HTML (${cardHTML.length} chars) for "${currentColumnLabel}"`);
    return cardHTML;
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
    console.log(`GitLab Milestone Compass: [getFilteredIssuesForKanbanLabel] Filtering ${allIssues.length} issues for label "${labelName}"`);
    
    const filteredIssues = Array.from(allIssues).filter(issue => {
      // Ensure we're working with actual issue rows (supports both GitLab versions)
      const isIssueRow = issue.classList.contains('issuable-row') || 
                        issue.classList.contains('!gl-border-b-section') ||
                        issue.tagName === 'LI';
      
      if (!isIssueRow) {
        console.log(`GitLab Milestone Compass: [getFilteredIssuesForKanbanLabel] Skipping non-issue element:`, issue.className);
        return false;
      }
      
      // First check if issue has the target label
      const labelLinks = issue.querySelectorAll(".gl-label .gl-label-link");
      console.log(`GitLab Milestone Compass: [getFilteredIssuesForKanbanLabel] Issue has ${labelLinks.length} label links`);
      
      const hasTargetLabel = Array.from(labelLinks).some(link => {
        const href = link.getAttribute("href");
        if (href) {
          const urlMatch = href.match(/label_name=([^&]+)/);
          if (urlMatch) {
            const decodedLabel = decodeURIComponent(urlMatch[1]);
            console.log(`GitLab Milestone Compass: [getFilteredIssuesForKanbanLabel] Found label "${decodedLabel}", looking for "${labelName}"`);
            return decodedLabel === labelName;
          }
        }
        return false;
      });
      
      console.log(`GitLab Milestone Compass: [getFilteredIssuesForKanbanLabel] Issue has target label "${labelName}": ${hasTargetLabel}`);
      
      if (!hasTargetLabel) return false;
      
      // Apply existing filter logic (BUT NOT SEARCH - that will be applied to Kanban cards)
      return applyNonSearchFiltersToIssue(issue);
    });
    
    return filteredIssues;
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
    console.log(`GitLab Milestone Compass: [getFilteredMiscIssuesForKanban] Filtering ${allIssues.length} issues for MISC column`);
    
    // Safety limit to prevent infinite loops
    const MAX_MISC_ISSUES = 10;
    let processedCount = 0;
    
    const filteredIssues = Array.from(allIssues).filter(issue => {
      processedCount++;
      if (processedCount > MAX_MISC_ISSUES) {
        console.log(`GitLab Milestone Compass: [getFilteredMiscIssuesForKanban] Hit safety limit of ${MAX_MISC_ISSUES} issues`);
        return false;
      }
      // Ensure we're working with actual issue rows (supports both GitLab versions)
      const isIssueRow = issue.classList.contains('issuable-row') || 
                        issue.classList.contains('!gl-border-b-section') ||
                        issue.tagName === 'LI';
      
      if (!isIssueRow) {
        console.log(`GitLab Milestone Compass: [getFilteredMiscIssuesForKanban] Skipping non-issue element:`, issue.className);
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
      
      // Apply existing filter logic (BUT NOT SEARCH - that will be applied to Kanban cards)
      return applyNonSearchFiltersToIssue(issue);
    });
    
    console.log(`GitLab Milestone Compass: [getFilteredMiscIssuesForKanban] Returning ${filteredIssues.length} MISC issues`);
    return filteredIssues;
  }

  // Simplified, safe version of MISC issues function
  function getSimpleMiscIssues(configuredLabels, allIssues, usedIssues = new Set()) {
    console.log(`GitLab Milestone Compass: [getSimpleMiscIssues] Starting with ${allIssues.length} issues`);
    
    const miscIssues = [];
    let processedCount = 0;
    const MAX_MISC_ISSUES = 5; // Conservative limit
    
    for (const issue of allIssues) {
      processedCount++;
      if (processedCount > 50) { // Safety limit for total processing
        console.log(`GitLab Milestone Compass: [getSimpleMiscIssues] Hit processing safety limit`);
        break;
      }
      
      // Skip if already used in other columns
      const issueUrl = getIssueUrlFromElement(issue);
      if (issueUrl && usedIssues.has(issueUrl)) {
        continue;
      }
      
      // Simple check: if issue doesn't have any of the configured labels, it's MISC
      const hasConfiguredLabel = configuredLabels.some(labelName => {
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
      
      if (!hasConfiguredLabel && miscIssues.length < MAX_MISC_ISSUES) {
        miscIssues.push(issue);
        console.log(`GitLab Milestone Compass: [getSimpleMiscIssues] Added MISC issue ${miscIssues.length}`);
      }
    }
    
    console.log(`GitLab Milestone Compass: [getSimpleMiscIssues] Returning ${miscIssues.length} MISC issues`);
    return miscIssues;
  }

  // Apply all filters except search (for Kanban card creation)
  function applyNonSearchFiltersToIssue(issue) {
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
    
    // NOTE: Title search is NOT applied here - it will be applied to Kanban cards
    return true;
  }

  function applyFiltersToIssue(issue) {
    // Apply non-search filters first
    if (!applyNonSearchFiltersToIssue(issue)) return false;
    
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
      // Try multiple selectors to find the title
      let title = "";
      
      // Strategy 1: Try to get title from title attribute
      const titleElement = issue.querySelector("span > a[title]");
      if (titleElement) {
        title = titleElement.getAttribute("title").toLowerCase();
      }
      
      // Strategy 2: If no title found, try text content of links
      if (!title) {
        const linkElement = issue.querySelector("a");
        if (linkElement) {
          title = linkElement.textContent.toLowerCase();
        }
      }
      
      // Strategy 3: If still no title, try any text in the issue
      if (!title) {
        title = issue.textContent.toLowerCase();
      }
      
      const searchTerms = currentFilters.titleSearch.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      const hasAllTerms = searchTerms.every(term => title.includes(term));
      if (!hasAllTerms) {        
        return false;
      } 
    }
    
    return true;
  }

  function showKanbanConfiguration(allLabels) {
    const profiles = loadKanbanProfiles();
    const activeProfileId = loadActiveKanbanProfile();
    
    const modal = document.createElement("div");
    modal.className = "kanban-config-modal";
    modal.innerHTML = `
      <div class="kanban-config-content">
        <div class="kanban-config-header">
          <h3>Configure Kanban Profiles</h3>
          <p>Create and manage different Kanban board configurations:</p>
        </div>
        
        <div class="kanban-profile-management">
          <div class="profile-selector">
            <h4>Kanban Profiles</h4>
            <div class="profile-list">
              ${Object.values(profiles).map(profile => `
                <div class="profile-item ${profile.id === activeProfileId ? 'active' : ''}" 
                     data-profile-id="${profile.id}">
                  <span class="profile-title">${profile.title}</span>
                  <div class="profile-actions">
                    <button class="btn-edit-profile" title="Edit Profile">✏️</button>
                    <button class="btn-delete-profile" title="Delete Profile">🗑️</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-default btn-sm add-profile-btn" id="add-profile-btn">+ Add New Profile</button>
          </div>
          
          <div class="profile-editor">
            <div class="profile-form" style="display: none;">
              <h4 id="profile-form-title">New Profile</h4>
              <input type="text" id="profile-title-input" placeholder="Profile Title (e.g., 'Development Areas')" class="form-input">
              <div class="kanban-config-labels">
                <div class="available-labels">
                  <h4>Available Labels</h4>
                  <div class="label-list" id="available-labels-list">
                    ${allLabels.map(label => `
                      <div class="config-label-item" data-label="${label.name}">
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
                    <!-- Labels will be populated when editing a profile -->
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Profile form actions in dedicated grid area -->
        <div class="profile-form-actions" style="display: none;">
          <button class="btn btn-success save-profile-btn">Save Profile</button>
          <button class="btn btn-outline cancel-profile-btn">Cancel</button>
        </div>
        
        <!-- Main modal actions in dedicated grid area -->
        <div class="kanban-config-actions">
          <button class="btn btn-outline close-config">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setupKanbanProfileHandlers(modal, allLabels);
    updateAddProfileButtonState(modal);
  }

  function updateAddProfileButtonState(modal) {
    const profiles = loadKanbanProfiles();
    const addButton = modal.querySelector("#add-profile-btn");
    
    if (Object.keys(profiles).length >= 5) {
      addButton.disabled = true;
      addButton.textContent = "Max 5 Profiles";
      addButton.style.opacity = "0.6";
      addButton.style.cursor = "not-allowed";
    } else {
      addButton.disabled = false;
      addButton.textContent = "+ Add New Profile";
      addButton.style.opacity = "1";
      addButton.style.cursor = "pointer";
    }
  }

  function setupKanbanProfileHandlers(modal, allLabels) {
    let currentEditingProfileId = null;
    
    modal.addEventListener("click", (e) => {
      // Profile management handlers
      if (e.target.classList.contains("add-profile-btn")) {
        const profiles = loadKanbanProfiles();
        if (Object.keys(profiles).length >= 5) {
          alert("Maximum of 5 profiles allowed per milestone. Please delete an existing profile first.");
          return;
        }
        showProfileForm(modal, allLabels);
        currentEditingProfileId = null;
      }
      
      if (e.target.classList.contains("btn-edit-profile")) {
        const profileItem = e.target.closest(".profile-item");
        const profileId = profileItem.dataset.profileId;
        editProfile(modal, allLabels, profileId);
        currentEditingProfileId = profileId;
      }
      
      if (e.target.classList.contains("btn-delete-profile")) {
        const profileItem = e.target.closest(".profile-item");
        const profileId = profileItem.dataset.profileId;
        deleteProfile(profileId);
        modal.remove();
        showKanbanConfiguration(allLabels); // Refresh modal with updated button state
      }
      
      // Profile form handlers
      if (e.target.classList.contains("save-profile-btn")) {
        saveProfileFromForm(modal, currentEditingProfileId);
      }
      
      if (e.target.classList.contains("cancel-profile-btn")) {
        hideProfileForm(modal);
      }
      
      // Label selection handlers (within profile form)
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
      
      // Close modal
      if (e.target.classList.contains("close-config")) {
        modal.remove();
      }
    });
  }

  function showProfileForm(modal, allLabels) {
    const profileForm = modal.querySelector(".profile-form");
    const profileFormActions = modal.querySelector(".profile-form-actions");
    const titleInput = modal.querySelector("#profile-title-input");
    const formTitle = modal.querySelector("#profile-form-title");
    
    formTitle.textContent = "New Profile";
    titleInput.value = "";
    clearSelectedLabels(modal);
    resetAvailableLabels(modal);
    profileForm.style.display = "block";
    profileFormActions.style.display = "flex";
  }
  
  function hideProfileForm(modal) {
    const profileForm = modal.querySelector(".profile-form");
    const profileFormActions = modal.querySelector(".profile-form-actions");
    profileForm.style.display = "none";
    profileFormActions.style.display = "none";
  }
  
  function editProfile(modal, allLabels, profileId) {
    const profiles = loadKanbanProfiles();
    const profile = profiles[profileId];
    if (!profile) return;
    
    const profileForm = modal.querySelector(".profile-form");
    const profileFormActions = modal.querySelector(".profile-form-actions");
    const titleInput = modal.querySelector("#profile-title-input");
    const formTitle = modal.querySelector("#profile-form-title");
    
    formTitle.textContent = `Edit Profile: ${profile.title}`;
    titleInput.value = profile.title;
    
    // Clear and populate selected labels
    clearSelectedLabels(modal);
    resetAvailableLabels(modal);
    
    if (profile.labels) {
      profile.labels.forEach(labelName => {
        addLabelToSelection(labelName, allLabels, modal);
        // Mark as selected in available labels
        const availableItem = modal.querySelector(`[data-label="${labelName}"]`);
        if (availableItem) {
          availableItem.classList.add("selected");
        }
      });
    }
    
    profileForm.style.display = "block";
    profileFormActions.style.display = "flex";
  }
  
  function deleteProfile(profileId) {
    const profiles = loadKanbanProfiles();
    const activeProfileId = loadActiveKanbanProfile();
    
    if (profiles[profileId]) {
      delete profiles[profileId];
      saveKanbanProfiles(profiles);
      
      // If we deleted the active profile, switch to another one
      if (activeProfileId === profileId) {
        const remainingProfiles = Object.keys(profiles);
        if (remainingProfiles.length > 0) {
          saveActiveKanbanProfile(remainingProfiles[0]);
        } else {
          saveActiveKanbanProfile(null);
        }
        
        // Refresh Kanban board
        const kanbanBoard = document.getElementById("kanban-board");
        if (kanbanBoard) {
          renderKanbanBoard(kanbanBoard);
        }
      }
    }
  }
  
  function saveProfileFromForm(modal, editingProfileId = null) {
    const titleInput = modal.querySelector("#profile-title-input");
    const title = titleInput.value.trim();
    
    if (!title) {
      alert("Please enter a profile title");
      return;
    }
    
    const selectedLabels = getSelectedLabelsFromForm(modal);
    
    const profiles = loadKanbanProfiles();
    const profileId = editingProfileId || generateProfileId();
    
    profiles[profileId] = {
      id: profileId,
      title: title,
      labels: selectedLabels
    };
    
    saveKanbanProfiles(profiles);
    
    // If this is the first profile or we're creating a new one, make it active
    if (!editingProfileId || Object.keys(profiles).length === 1) {
      saveActiveKanbanProfile(profileId);
    }
    
    // Refresh Kanban board and close modal
    const kanbanBoard = document.getElementById("kanban-board");
    if (kanbanBoard) {
      renderKanbanBoard(kanbanBoard);
    }
    
    modal.remove();
  }
  
  function generateProfileId() {
    return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  function getSelectedLabelsFromForm(modal) {
    const selectedItems = modal.querySelectorAll(".selected-label-item");
    return Array.from(selectedItems).map(item => item.dataset.label);
  }
  
  function clearSelectedLabels(modal) {
    const selectedList = modal.querySelector("#selected-labels");
    selectedList.innerHTML = "";
  }
  
  function resetAvailableLabels(modal) {
    const availableItems = modal.querySelectorAll(".config-label-item");
    availableItems.forEach(item => item.classList.remove("selected"));
  }

  function addLabelToSelection(labelName, allLabels, modal) {
    const label = allLabels.find(l => l.name === labelName);
    if (!label) return;
    
    const selectedList = modal.querySelector("#selected-labels");
    const item = document.createElement("div");
    item.className = "selected-label-item";
    item.setAttribute("data-label", labelName);
    
    // Add drag and drop attributes
    item.draggable = true;
    item.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span class="label-badge" style="background-color: ${label.color}; color: ${label.isLightText ? '#ffffff' : '#000000'};">
        ${label.text}
      </span>
      <button class="remove-label">×</button>
    `;
    
    // Add drag event listeners
    setupDragAndDrop(item, selectedList);
    
    selectedList.appendChild(item);
  }

  // Global variable to track the currently dragged element
  let currentDraggedElement = null;

  function setupDragAndDrop(item, selectedList) {
    item.addEventListener('dragstart', (e) => {
      currentDraggedElement = item;
      item.style.opacity = '0.5';
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', item.outerHTML);
      console.log(`Started dragging: ${item.getAttribute('data-label')}`);
    });

    item.addEventListener('dragend', (e) => {
      item.style.opacity = '';
      item.classList.remove('dragging');
      currentDraggedElement = null;
      console.log(`Finished dragging: ${item.getAttribute('data-label')}`);
    });

    // Setup drop zone for the container (only once per container)
    if (!selectedList.hasAttribute('data-drop-setup')) {
      selectedList.setAttribute('data-drop-setup', 'true');
      
      selectedList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (currentDraggedElement) {
          const afterElement = getDragAfterElement(selectedList, e.clientY);
          if (afterElement == null) {
            selectedList.appendChild(currentDraggedElement);
          } else {
            selectedList.insertBefore(currentDraggedElement, afterElement);
          }
        }
      });

      selectedList.addEventListener('drop', (e) => {
        e.preventDefault();
        // The dragged element should already be in the correct position
        console.log('Kanban column order updated');
      });
    }
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.selected-label-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
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

  function initializeViewMode() {
    
    // Ensure clean state - hide both views first
    hideKanbanBoard();
    hideStatusSections();
    
    const currentMode = loadViewMode();
    
    if (currentMode === "kanban") {
      showKanbanView();
    } else {
      showStatusView();
    }
    
    updateViewToggleButton();
  }
})();

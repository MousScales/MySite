// Initialize the map with disabled zoom
const map = L.map('map', {
    zoomControl: false,  // Remove zoom controls
    dragging: true,      // Keep panning enabled
    touchZoom: false,    // Disable touch zoom
    scrollWheelZoom: false, // Disable scroll wheel zoom
    doubleClickZoom: false, // Disable double click zoom
    boxZoom: false,      // Disable box zoom
    keyboard: true,      // Keep keyboard navigation
    zoomSnap: 0,        // Disable zoom snapping
}).setView([20, 0], 2.5);

// Prevent zoom via keyboard + and - keys
map.keyboard.disable();

// Add the tile layer (map style)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 2.5,
    minZoom: 2.5
}).addTo(map);

// Set map bounds to prevent infinite scrolling
const bounds = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
map.setMaxBounds(bounds);
map.on('drag', function() {
    map.panInsideBounds(bounds, { animate: false });
});

// Store current selection
let currentCountry = null;
let currentLayer = null;
let activeDate = null;
let currentCatalogSlide = 0;
let currentImageIndex = 0;
let currentImages = [];
let totalCountries = 193; // Updated to reflect UN member states
let slideInterval;
let touchStartX = 0;
let touchEndX = 0;

// Country name mappings
const countryNameMappings = {
    'United States': ['United States of America', 'USA', 'US', 'United States'],
    'United Arab Emirates': ['United Arab Emirates', 'UAE'],
    'Saudi Arabia': ['Saudi Arabia', 'Kingdom of Saudi Arabia'],
    'Senegal': ['Senegal', 'Republic of Senegal'],
    'Egypt': ['Egypt', 'Arab Republic of Egypt']
};

// List of visited countries (primary names)
const visitedCountries = ['United States', 'United Arab Emirates', 'Saudi Arabia', 'Senegal', 'Egypt'];

// Map display country names to S3 folder names
const countryS3FolderMap = {
    'United States': 'usa',
    'United Arab Emirates': 'uae',
    'Saudi Arabia': 'saudi',
    'Senegal': 'senegal',
    'Egypt': 'egypt'
};

// Function to normalize country names
function normalizeCountryName(name) {
    for (const [primaryName, variations] of Object.entries(countryNameMappings)) {
        if (variations.includes(name)) {
            return primaryName;
        }
    }
    return name;
}

// Function to update progress bar
function updateProgressBar(total) {
    const visited = visitedCountries.length;
    const percentage = (visited / total) * 100;
    
    document.getElementById('progress-stats').textContent = `${visited}/${total}`;
    document.querySelector('.progress-fill').style.width = `${percentage}%`;
}

// Style for country features
function style(feature) {
    const countryName = normalizeCountryName(feature.properties.name);
    const baseStyle = {
        fillColor: '#e0e0e0',
        weight: 1,
        opacity: 0.5,
        color: '#bdbdbd',
        fillOpacity: 0.7
    };

    // If country is not visited, keep it grey
    if (!visitedCountries.includes(countryName)) {
        return baseStyle;
    }

    // Highlight visited countries
    return {
        fillColor: 'rgba(50, 50, 50, 0.5)',
        weight: 1,
        opacity: 0.7,
        color: '#424242',
        fillOpacity: 0.5
    };
}

// Declare s3Main at the top to avoid TDZ errors
let s3Main = null;
let s3Ready = false;
let s3ReadyCallbacks = [];

function onS3Ready(cb) {
    if (s3Ready) {
        cb();
    } else {
        s3ReadyCallbacks.push(cb);
    }
}

// Remove the patch for updateCountryInfo, as it's now handled directly above

// Add click handler for the map
map.on('click', function(e) {
    // Check if we clicked on a country layer
    let clickedOnCountry = false;
    map.eachLayer(function(layer) {
        if (layer.feature && layer._bounds && layer._bounds.contains(e.latlng)) {
            clickedOnCountry = true;
        }
    });

    // If we didn't click on a country, deselect the current country
    if (!clickedOnCountry) {
        if (currentLayer) {
            currentLayer.setStyle(style(currentLayer.feature));
        }
        currentCountry = null;
        currentLayer = null;
        updateCountryInfo(null);
    }
});

// Modify the onCountryClick function to use the mapping
function onCountryClick(e) {
    L.DomEvent.stopPropagation(e);
    
    const layer = e.target;
    const countryName = normalizeCountryName(layer.feature.properties.name);
    
    // If country is not visited, do nothing
    if (!visitedCountries.includes(countryName)) {
        return;
    }

    // Reset style of previously selected country
    if (currentLayer && currentLayer !== layer) {
        currentLayer.setStyle(style(currentLayer.feature));
    }

    // Update current selection
    currentCountry = countryName;
    currentLayer = layer;

    // Update country info panel
    updateCountryInfo(countryName);
}

// Add interaction handlers to countries
function onEachFeature(feature, layer) {
    layer.on({
        click: onCountryClick,
        mouseover: function(e) {
            const layer = e.target;
            const countryName = layer.feature.properties.name;
            
            // Only add hover effect for visited countries
            if (visitedCountries.includes(countryName)) {
                layer.setStyle({
                    weight: 2,
                    color: '#424242',
                    fillOpacity: 0.6,
                    fillColor: 'rgba(50, 50, 50, 0.6)'
                });
            }
        },
        mouseout: function(e) {
            const layer = e.target;
            const countryName = layer.feature.properties.name;
            
            // Don't reset style if this is the selected country
            if (countryName === currentCountry) {
                return;
            }
            
            // Reset to appropriate style based on visited status
            layer.setStyle(style(layer.feature));
        }
    });
}

// Fetch and add GeoJSON data
fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
    .then(response => response.json())
    .then(data => {
        updateProgressBar(totalCountries);
        L.geoJson(data, {
            style: style,
            onEachFeature: onEachFeature
        }).addTo(map);

        // Initialize random country button
        const randomBtn = document.getElementById('random-country-btn');
        if (randomBtn) {
            console.log('Random button found, attaching click handler');
            randomBtn.addEventListener('click', function() {
                console.log('Random button clicked');
                // Get a random country from the visited countries list
                const randomIndex = Math.floor(Math.random() * visitedCountries.length);
                const randomCountry = visitedCountries[randomIndex];
                console.log('Selected random country:', randomCountry);
                
                // Find and click the country on the map
                let foundCountry = false;
                map.eachLayer(function(layer) {
                    if (layer.feature) {
                        const countryName = normalizeCountryName(layer.feature.properties.name);
                        console.log('Checking country:', countryName);
                        if (countryName === randomCountry) {
                            console.log('Found matching country, highlighting');
                            foundCountry = true;
                            
                            // Add a temporary highlight effect
                            layer.setStyle({
                                fillColor: '#FFD700',
                                weight: 3,
                                color: '#FFA500',
                                fillOpacity: 0.6
                            });
                            
                            // Trigger the click event
                            onCountryClick({ target: layer });
                            
                            // Reset the style after animation
                            setTimeout(() => {
                                layer.setStyle(style(layer.feature));
                            }, 1000);
                            
                            // Pan to the country
                            map.fitBounds(layer.getBounds(), {
                                padding: [50, 50],
                                maxZoom: 2.5,
                                animate: true,
                                duration: 1
                            });
                        }
                    }
                });
                
                if (!foundCountry) {
                    console.log('No matching country found on map');
                }
            });
        } else {
            console.log('Random button not found in DOM');
        }
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

// Initially hide the carousel
var carouselContainer = document.querySelector('.carousel-container');
if (carouselContainer) carouselContainer.style.display = 'none';
var carouselDots = document.querySelector('.carousel-dots');
if (carouselDots) carouselDots.style.display = 'none';
document.querySelectorAll('.carousel-button').forEach(button => button.style.display = 'none');

// Update the style function to include new filter styles
function getFilterStyle(type) {
    const styles = {
        home: {
            fillColor: 'rgba(0, 123, 255, 0.2)',
            color: '#007bff',
            weight: 2
        },
        favorites: {
            fillColor: 'rgba(255, 82, 82, 0.2)',
            color: '#ff5252',
            weight: 2
        },
        wishlist: {
            fillColor: 'rgba(255, 193, 7, 0.2)',
            color: '#ffc107',
            weight: 2
        },
        recent: {
            fillColor: 'rgba(156, 39, 176, 0.2)',
            color: '#9c27b0',
            weight: 2
        },
        'most-photos': {
            fillColor: 'rgba(255, 152, 0, 0.2)',
            color: '#ff9800',
            weight: 2
        }
    };
    return styles[type] || styles.home;
}

// Update the handleFilterClick function
function handleFilterClick(filter) {
    // If clicking the active filter, deactivate it
    if (currentFilter === filter) {
        currentFilter = null;
    } else {
        currentFilter = filter;
    }

    // Update map styles
    map.eachLayer(function(layer) {
        if (layer.feature) {
            layer.setStyle(style(layer.feature));
        }
    });
}

// Add click event listeners to filter buttons
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            handleFilterClick(filter);
            
            // Update active state of filter buttons
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

function createPopup(content) {
    const popup = document.createElement('div');
    popup.className = 'image-popup';
    
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    
    const popupContent = document.createElement('div');
    popupContent.className = 'popup-content';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-popup';
    closeBtn.innerHTML = '×';
    
    // Clone the content (image or video)
    const clonedContent = content.cloneNode(true);
    if (clonedContent.tagName === 'VIDEO') {
        clonedContent.controls = false;
        clonedContent.currentTime = content.currentTime;
        
        // Fix video orientation
        clonedContent.style.transform = '';
        
        // Wait for metadata to load to check orientation
        clonedContent.addEventListener('loadedmetadata', () => {
            // Get video dimensions
            const videoWidth = clonedContent.videoWidth;
            const videoHeight = clonedContent.videoHeight;
            
            // Check if video needs rotation based on dimensions and orientation
            if (videoWidth < videoHeight) {
                // Portrait video - check if it needs rotation
                clonedContent.style.maxHeight = '90vh';
                clonedContent.style.width = 'auto';
            } else {
                // Landscape video
                clonedContent.style.maxWidth = '90vw';
                clonedContent.style.height = 'auto';
            }
        });
        
        // Add play button to popup video
        const playButton = document.createElement('button');
        playButton.className = 'video-play-button';
        
        playButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (clonedContent.paused) {
                clonedContent.play();
            } else {
                clonedContent.pause();
            }
        });
        
        clonedContent.addEventListener('play', () => {
            playButton.style.display = 'none';
        });
        
        clonedContent.addEventListener('pause', () => {
            playButton.style.display = 'flex';
        });
        
        clonedContent.addEventListener('ended', () => {
            playButton.style.display = 'flex';
            clonedContent.currentTime = 0;
        });
        
        popupContent.appendChild(clonedContent);
        popupContent.appendChild(playButton);
        
        // Start playing if original was playing
        if (!content.paused) {
            clonedContent.play();
        }
    } else {
        popupContent.appendChild(clonedContent);
    }
    
    popup.appendChild(overlay);
    popup.appendChild(popupContent);
    popup.appendChild(closeBtn);
    
    // Close popup when clicking overlay or close button
    overlay.addEventListener('click', () => {
        popup.classList.remove('active');
        setTimeout(() => popup.remove(), 300);
    });
    
    closeBtn.addEventListener('click', () => {
        popup.classList.remove('active');
        setTimeout(() => popup.remove(), 300);
    });
    
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('active'), 10);
}

function initializeMediaHandlers(catalog) {
    // Handle images
    const images = catalog.querySelectorAll('.catalog-slide img');
    images.forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            createPopup(img);
        });
    });
    
    // Handle videos
    const videos = catalog.querySelectorAll('.catalog-slide video');
    videos.forEach(video => {
        let lastTap = 0;
        let clickCount = 0;
        let clickTimer = null;
        let startX = 0;
        let isVideoClick = false;
        
        // Remove default controls
        video.controls = false;
        
        // Prevent video clicks from triggering swipe
        video.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isVideoClick = true;
            startX = e.clientX;
        });

        video.addEventListener('mousemove', (e) => {
            if (Math.abs(e.clientX - startX) > 10) {
                isVideoClick = false;
            }
        });
        
        // Add click handler to video
        video.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            if (!isVideoClick) return;
            
            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                    // Single click - play/pause
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimer);
                clickCount = 0;
                // Double click - show popup
                createPopup(video);
            }
        });
        
        // Handle touch events
        let touchStartX = 0;
        video.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            touchStartX = e.touches[0].clientX;
        });

        video.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        });
        
        video.addEventListener('touchend', (e) => {
            e.stopPropagation();
            // Only handle as click if there was minimal horizontal movement
            if (Math.abs(e.changedTouches[0].clientX - touchStartX) < 10) {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;
                
                if (tapLength < 500 && tapLength > 0) {
                    // Double tap detected
                    createPopup(video);
                } else {
                    // Single tap - play/pause
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                }
                lastTap = currentTime;
            }
        });
        
        // Add custom play button overlay
        const playButton = document.createElement('button');
        playButton.className = 'video-play-button';
        video.parentElement.appendChild(playButton);
        
        // Prevent play button clicks from triggering swipe
        playButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        playButton.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        
        // Show/hide play button based on video state
        playButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        });
        
        video.addEventListener('play', () => {
            playButton.style.display = 'none';
        });
        
        video.addEventListener('pause', () => {
            playButton.style.display = 'flex';
        });
        
        video.addEventListener('ended', () => {
            playButton.style.display = 'flex';
            video.currentTime = 0;
        });
        
        // Ensure video starts paused
        video.pause();
    });
}

function togglePhotoCatalog(date) {
    const mapContainer = document.getElementById('map');
    const catalogs = {
        'March 2023': document.getElementById('egypt-catalog'),
        'Summer 2024': document.getElementById('senegal-catalog'),
        'March 2025 Dubai': document.getElementById('uae-catalog'),
        'March 2025': document.getElementById('saudi-catalog')
    };
    const currentCatalog = catalogs[date];

    // Reset current slide
    currentCatalogSlide = 0;

    // Hide all catalogs first
    Object.values(catalogs).forEach(catalog => {
        if (catalog) {
            catalog.style.display = 'none';
            // Pause all videos in this catalog
            const videos = catalog.querySelectorAll('video');
            videos.forEach(video => {
                video.pause();
            });
        }
    });

    if (activeDate === date) {
        // Hide catalog, show map
        mapContainer.style.display = 'block';
        activeDate = null;
    } else {
        // Show correct catalog, hide map
        if (currentCatalog) {
            currentCatalog.style.display = 'block';
            mapContainer.style.display = 'none';
            activeDate = date;
            
            // Initialize the first slide
            const slides = currentCatalog.querySelectorAll('.catalog-slide');
            const dots = currentCatalog.querySelectorAll('.catalog-dot');
            slides.forEach(slide => slide.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));
            slides[0].classList.add('active');
            dots[0].classList.add('active');

            // Initialize handlers if not already initialized
            if (!currentCatalog.hasAttribute('data-initialized')) {
                initializeSwipeListeners(currentCatalog);
                initializeMediaHandlers(currentCatalog);
                initializeArrowButtons(currentCatalog);
                initializeVideoThumbnails(currentCatalog);
                currentCatalog.setAttribute('data-initialized', 'true');
            }
        }
    }
}

function initializePhotoHandlers(catalog) {
    // Remove existing click handlers
    const photoItems = catalog.querySelectorAll('.photo-item');
    photoItems.forEach(item => {
        const clone = item.cloneNode(true);
        item.parentNode.replaceChild(clone, item);
    });

    // Add new click handlers
    catalog.querySelectorAll('.photo-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const img = this.querySelector('img');
            const video = this.querySelector('video');
            if (img) {
                openImagePopup(img);
            } else if (video) {
                openImagePopup(video);
            }
        });
    });
}

// Function to select and highlight a random country
function selectRandomCountry() {
    // Get a random country from the visited countries list
    const randomIndex = Math.floor(Math.random() * visitedCountries.length);
    const randomCountry = visitedCountries[randomIndex];
    
    // Find and click the country on the map
    map.eachLayer(function(layer) {
        if (layer.feature) {
            const countryName = normalizeCountryName(layer.feature.properties.name);
            if (countryName === randomCountry) {
                // Add a temporary highlight effect
                const originalStyle = layer.options;
                layer.setStyle({
                    fillColor: '#FFD700',
                    weight: 3,
                    color: '#FFA500',
                    fillOpacity: 0.6
                });
                
                // Trigger the click event
                onCountryClick({ target: layer });
                
                // Reset the style after animation
                setTimeout(() => {
                    layer.setStyle(style(layer.feature));
                }, 1000);
                
                // Pan to the country
                map.fitBounds(layer.getBounds(), {
                    padding: [50, 50],
                    maxZoom: 2.5,
                    animate: true,
                    duration: 1
                });
            }
        }
    });
}

// Add click handler for random country button
document.addEventListener('DOMContentLoaded', function() {
    const randomBtn = document.getElementById('random-country-btn');
    if (randomBtn) {
        randomBtn.addEventListener('click', selectRandomCountry);
    }
    
    // ... existing DOMContentLoaded code ...
});

// Initialize handlers when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize photo handlers
    initializePhotoHandlers();
    
    // Keyboard navigation (just escape to close)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeImagePopup();
        }
    });

    // Initialize filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            handleFilterClick(filter);
            
            // Update active state of filter buttons
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

function initializeVideoHandlers(catalog) {
    const videos = catalog.querySelectorAll('video');
    videos.forEach(video => {
        // Add click handler to video
        video.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent swipe handler from triggering
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        });
        
        // Add custom play button overlay
        const playButton = document.createElement('button');
        playButton.className = 'video-play-button';
        video.parentElement.appendChild(playButton);
        
        // Show/hide play button based on video state
        playButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent swipe handler from triggering
            video.play();
        });
        
        video.addEventListener('play', () => {
            playButton.style.display = 'none';
        });
        
        video.addEventListener('pause', () => {
            playButton.style.display = 'flex';
        });
        
        // Ensure video starts paused
        video.pause();
    });
}

function moveToSlide(catalog, targetSlideIndex) {
    const slides = catalog.querySelectorAll('.catalog-slide');
    const dots = catalog.querySelectorAll('.catalog-dot');
    
    // Ensure target index is within bounds
    const totalSlides = slides.length;
    if (targetSlideIndex < 0) {
        targetSlideIndex = totalSlides - 1; // Wrap to last slide
    } else if (targetSlideIndex >= totalSlides) {
        targetSlideIndex = 0; // Wrap to first slide
    }
    
    // Pause current video if exists
    const currentVideo = slides[currentCatalogSlide].querySelector('video');
    if (currentVideo) {
        currentVideo.pause();
    }
    
    // Update slides
    slides[currentCatalogSlide].classList.remove('active');
    slides[targetSlideIndex].classList.add('active');
    
    // Update dots
    dots[currentCatalogSlide].classList.remove('active');
    dots[targetSlideIndex].classList.add('active');
    
    // Update current slide index
    currentCatalogSlide = targetSlideIndex;
}

function initializeSwipeListeners(catalog) {
    // Touch events
    catalog.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    });

    catalog.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) > 50) { // Minimum swipe distance
            if (swipeDistance > 0) {
                // Swipe right - go to previous slide
                moveToSlide(catalog, currentCatalogSlide - 1);
            } else {
                // Swipe left - go to next slide
                moveToSlide(catalog, currentCatalogSlide + 1);
            }
        }
    });

    // Mouse events
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseEndX = 0;

    catalog.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        mouseStartX = e.clientX;
    });

    catalog.addEventListener('mousemove', (e) => {
        if (isMouseDown) {
            mouseEndX = e.clientX;
        }
    });

    catalog.addEventListener('mouseup', () => {
        if (isMouseDown) {
            const swipeDistance = mouseEndX - mouseStartX;
            if (Math.abs(swipeDistance) > 50) { // Minimum swipe distance
                if (swipeDistance > 0) {
                    // Swipe right - go to previous slide
                    moveToSlide(catalog, currentCatalogSlide - 1);
                } else {
                    // Swipe left - go to next slide
                    moveToSlide(catalog, currentCatalogSlide + 1);
                }
            }
            isMouseDown = false;
        }
    });

    catalog.addEventListener('mouseleave', () => {
        isMouseDown = false;
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
        const activeCatalog = document.querySelector('.photo-catalog[style*="display: block"]');
        if (activeCatalog) {
            if (e.key === 'ArrowLeft') {
                moveToSlide(activeCatalog, currentCatalogSlide - 1);
            } else if (e.key === 'ArrowRight') {
                moveToSlide(activeCatalog, currentCatalogSlide + 1);
            }
        }
    });
}

function initializeVideoThumbnails(catalog) {
    const videos = catalog.querySelectorAll('video');
    videos.forEach(video => {
        // Load the video metadata
        video.addEventListener('loadedmetadata', () => {
            // Set the current time to 1 second or the middle of the video
            const thumbnailTime = Math.min(1, video.duration / 2);
            video.currentTime = thumbnailTime;
        });

        // Once we've seeked to the thumbnail time, capture it as a poster
        video.addEventListener('seeked', () => {
            if (!video.hasAttribute('poster')) {
                // Create a canvas to capture the thumbnail
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Set the poster attribute
                try {
                    const thumbnailUrl = canvas.toDataURL('image/jpeg');
                    video.setAttribute('poster', thumbnailUrl);
                } catch (e) {
                    console.error('Could not generate thumbnail:', e);
                }
                
                // Reset video to start
                video.currentTime = 0;
            }
        });
    });
}

function initializeArrowButtons(catalog) {
    // Create arrow buttons
    const prevButton = document.createElement('button');
    const nextButton = document.createElement('button');
    
    prevButton.className = 'catalog-arrow prev';
    nextButton.className = 'catalog-arrow next';
    
    prevButton.innerHTML = '❮';
    nextButton.innerHTML = '❯';
    
    // Add click handlers
    prevButton.addEventListener('click', (e) => {
        e.stopPropagation();
        moveToSlide(catalog, currentCatalogSlide - 1);
    });
    
    nextButton.addEventListener('click', (e) => {
        e.stopPropagation();
        moveToSlide(catalog, currentCatalogSlide + 1);
    });
    
    // Add buttons to catalog
    catalog.appendChild(prevButton);
    catalog.appendChild(nextButton);
}

// AWS Configuration
const AWS_CONFIG = {
    region: 'us-east-2', // Your Ohio region
    bucketName: 'mous-life-journal',
    allowedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'MOV'],
    cognito: {
        identityPoolId: 'us-east-2:749f4e77-a158-4363-ba7d-dd0357652ad2',
        userPoolId: 'us-east-2_uKaIhSvH7'
    }
};

// Initialize AWS SDK with credentials
async function initializeAWS() {
    try {
        // For production, use Cognito
        if (process.env.NODE_ENV === 'production') {
            const credentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: AWS_CONFIG.cognito.identityPoolId
            });
            
            AWS.config.update({
                region: AWS_CONFIG.region,
                credentials: credentials
            });

            // Initialize the Amazon Cognito credentials provider
            AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: AWS_CONFIG.cognito.identityPoolId
            });
        }
        // For development, try environment variables first
        else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || AWS_CONFIG.region
            });
        }
        // Otherwise, use the AWS CLI credentials
        else {
            AWS.config.update({
                region: AWS_CONFIG.region
            });
        }
        
        // Test the connection
        const s3 = new AWS.S3();
        await s3.listBuckets().promise();
        console.log('AWS Connection Successful');
    } catch (error) {
        console.error('AWS Connection Error:', error);
    }
}

// Create S3 instance
const s3 = new AWS.S3();

// Initialize AWS when the page loads
document.addEventListener('DOMContentLoaded', initializeAWS);

// Function to list all media in a section
async function loadSectionMedia(sectionName) {
    try {
        const params = {
            Bucket: AWS_CONFIG.bucketName,
            Prefix: `sections/${sectionName}/`
        };

        const data = await s3.listObjectsV2(params).promise();
        const mediaFiles = data.Contents
            .filter(item => {
                const extension = item.Key.split('.').pop().toLowerCase();
                return AWS_CONFIG.allowedFileTypes.includes(extension);
            })
            .map(item => ({
                url: `https://${AWS_CONFIG.bucketName}.s3.${AWS_CONFIG.region}.amazonaws.com/${item.Key}`,
                type: item.Key.split('.').pop().toLowerCase().includes('mp4') || 
                      item.Key.split('.').pop().toLowerCase().includes('mov') ? 'video' : 'image',
                key: item.Key
            }));

        return mediaFiles;
    } catch (error) {
        console.error('Error loading media:', error);
        return [];
    }
}

// Function to create photo/video grid for a section
async function createMediaGrid(sectionName, containerId) {
    const mediaFiles = await loadSectionMedia(sectionName);
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    
    const photoGrid = document.createElement('div');
    photoGrid.className = 'photo-grid';

    mediaFiles.forEach(media => {
        const item = document.createElement('div');
        item.className = 'photo-item';

        if (media.type === 'video') {
            const video = document.createElement('video');
            video.src = media.url;
            video.controls = true;
            item.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = media.url;
            img.alt = `${sectionName} media`;
            item.appendChild(img);
        }

        photoGrid.appendChild(item);
    });

    container.appendChild(photoGrid);
}

// Initialize media loading for each section
async function initializeMediaSections() {
    const sections = ['UAE', 'Egypt', 'Senegal', 'Saudi', 'USA'];
    for (const section of sections) {
        await createMediaGrid(section.toLowerCase(), `${section.toLowerCase()}-catalog`);
    }
}

// Call initialization when document is ready
document.addEventListener('DOMContentLoaded', initializeMediaSections);

// AWS S3 config for main site
const AWS_CONFIG_MAIN = {
    region: 'us-east-2',
    bucketName: 'mous-life-journal',
    cognito: {
        identityPoolId: 'us-east-2:749f4e77-a158-4363-ba7d-dd0357652ad2',
        userPoolId: 'us-east-2_uKaIhSvH7'
    }
};

// Initialize AWS SDK for main site
if (window.AWS) {
    AWS.config.update({ region: AWS_CONFIG_MAIN.region });
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: AWS_CONFIG_MAIN.cognito.identityPoolId
    });
    s3Main = new AWS.S3();
    s3Ready = true;
    s3ReadyCallbacks.forEach(cb => cb());
    s3ReadyCallbacks = [];
}

// Fetch and display event/section list for a country
async function showEventListForCountry(country) {
    if (typeof s3Main === 'undefined' || !s3Main) {
        console.warn('S3 not initialized yet, skipping event list fetch.');
        return;
    }
    const eventListPanel = document.getElementById('event-list-panel');
    if (!country) {
        eventListPanel.style.display = 'none';
        return;
    }
    eventListPanel.innerHTML = '<div style="color:var(--text-secondary);">Loading sections...</div>';
    eventListPanel.style.display = 'block';
    try {
        const s3Folder = getS3FolderName(country);
        const params = {
            Bucket: AWS_CONFIG_MAIN.bucketName,
            Prefix: `sections/${s3Folder}/`,
            Delimiter: '/'
        };
        console.log('[S3] Fetching events for', country, '| S3 folder:', s3Folder, '| Params:', params);
        const data = await s3Main.listObjectsV2(params).promise();
        console.log('[S3] Raw data:', data);
        const events = [];
        if (data.CommonPrefixes) {
            data.CommonPrefixes.forEach(prefix => {
                const eventName = prefix.Prefix.split('/')[2];
                if (eventName && eventName.trim() && eventName !== '.DS_Store') events.push(eventName);
            });
        }
        console.log('[S3] Events found:', events);
        if (events.length === 0) {
            eventListPanel.innerHTML = '<div style="color:var(--text-secondary);font-size:18px;text-align:center;margin-top:40px;">memories coming soon</div>';
            return;
        }
        eventListPanel.innerHTML = '';
        events.forEach(event => {
            const btn = document.createElement('button');
            btn.textContent = event;
            btn.className = 'event-section-btn';
            btn.style = 'display:block;width:100%;margin-bottom:10px;padding:12px;border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--accent-color);cursor:pointer;text-align:left;font-size:16px;';
            btn.onclick = () => showEventMedia(country, event);
            eventListPanel.appendChild(btn);
        });
    } catch (err) {
        eventListPanel.innerHTML = '<div style="color:red;">Error loading sections.</div>';
        console.error('[S3] Error loading events:', err);
    }
}

// Fetch and display media for a section/event
async function showEventMedia(country, event) {
    const eventListPanel = document.getElementById('event-list-panel');
    const mapContainer = document.querySelector('.map-container');
    let mediaGrid = document.getElementById('media-grid-panel');
    if (!mediaGrid) {
        mediaGrid = document.createElement('div');
        mediaGrid.id = 'media-grid-panel';
        mediaGrid.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1000;background:var(--bg-primary);overflow-y:auto;display:none;';
        document.body.appendChild(mediaGrid);
    }
    // Hide map and info panel
    mapContainer.style.display = 'none';
    document.querySelector('.info-panel').style.display = 'none';
    // Show media grid
    mediaGrid.style.display = 'block';
    // Create header row with back button and section name
    const headerRow = document.createElement('div');
    headerRow.style = 'display:flex;align-items:center;gap:18px;padding:24px 24px 0 24px;';
    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '← Back';
    backBtn.className = 'event-section-btn';
    backBtn.style = 'padding:10px 18px;border-radius:8px;background:var(--bg-tertiary);color:var(--accent-color);border:1px solid var(--accent-color);cursor:pointer;font-size:16px;margin:0;';
    backBtn.onclick = () => {
        mediaGrid.style.display = 'none';
        mapContainer.style.display = 'block';
        document.querySelector('.info-panel').style.display = 'block';
        showEventListForCountry(country);
    };
    // Section name
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = event;
    sectionTitle.style = 'color:var(--accent-color);margin:0;font-size:2em;font-weight:600;flex:1;text-align:center;';
    headerRow.appendChild(backBtn);
    headerRow.appendChild(sectionTitle);
    mediaGrid.innerHTML = '';
    mediaGrid.appendChild(headerRow);
    mediaGrid.innerHTML += `<div style='color:var(--text-secondary);margin-bottom:10px;text-align:center;'>Loading media...</div>`;
    try {
        const s3Folder = getS3FolderName(country);
        const params = {
            Bucket: AWS_CONFIG_MAIN.bucketName,
            Prefix: `sections/${s3Folder}/${event}/`
        };
        const data = await s3Main.listObjectsV2(params).promise();
        const mediaFiles = (data.Contents || []).filter(item => !item.Key.endsWith('/.folder'));
        if (mediaFiles.length === 0) {
            mediaGrid.innerHTML += '<div style="color:var(--text-secondary);">No media found in this section.</div>';
            return;
        }
        const grid = document.createElement('div');
        grid.style = 'display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:24px;height:calc(100vh - 120px);box-sizing:border-box;';
        mediaFiles.forEach(item => {
            const ext = item.Key.split('.').pop().toLowerCase();
            let el;
            if (["jpg","jpeg","png","gif","webp"].includes(ext)) {
                el = document.createElement('img');
                el.src = `https://${AWS_CONFIG_MAIN.bucketName}.s3.${AWS_CONFIG_MAIN.region}.amazonaws.com/${item.Key}`;
                el.style = 'width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.12);cursor:pointer;';
                // Show popup with larger image on click
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    createPopup(el);
                });
            } else if (["mp4","mov","webm"].includes(ext)) {
                // Video wrapper for custom controls
                const wrapper = document.createElement('div');
                wrapper.style = 'position:relative;width:100%;height:100%;aspect-ratio:1/1;border-radius:10px;background:#000;box-shadow:0 2px 8px rgba(0,0,0,0.12);display:flex;align-items:center;justify-content:center;';
                const video = document.createElement('video');
                video.src = `https://${AWS_CONFIG_MAIN.bucketName}.s3.${AWS_CONFIG_MAIN.region}.amazonaws.com/${item.Key}`;
                video.style = 'width:100%;height:100%;object-fit:cover;border-radius:10px;background:#000;';
                video.controls = false;
                // Custom play button
                const playButton = document.createElement('button');
                playButton.className = 'video-play-button';
                playButton.style.display = 'flex';
                playButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                });
                // Progress bar
                const progressBar = document.createElement('input');
                progressBar.type = 'range';
                progressBar.min = 0;
                progressBar.max = 1;
                progressBar.step = 0.01;
                progressBar.value = 0;
                progressBar.style = 'position:absolute;left:10px;right:10px;bottom:14px;width:calc(100% - 20px);height:6px;border-radius:3px;background:rgba(255,255,255,0.2);accent-color:var(--accent-color);z-index:11;';
                // Update progress bar as video plays
                video.addEventListener('timeupdate', () => {
                    if (video.duration) progressBar.value = video.currentTime / video.duration;
                });
                // Seek video when progress bar is changed
                progressBar.addEventListener('input', (e) => {
                    if (video.duration) video.currentTime = progressBar.value * video.duration;
                });
                // Show/hide play button
                video.addEventListener('play', () => { playButton.style.display = 'none'; });
                video.addEventListener('pause', () => { playButton.style.display = 'flex'; });
                video.addEventListener('ended', () => {
                    playButton.style.display = 'flex';
                    video.currentTime = 0;
                });
                // Double click to show popup
                let clickCount = 0;
                let clickTimer = null;
                video.addEventListener('click', (e) => {
                    clickCount++;
                    if (clickCount === 1) {
                        clickTimer = setTimeout(() => {
                            clickCount = 0;
                            // Single click: play/pause
                            if (video.paused) video.play(); else video.pause();
                        }, 250);
                    } else if (clickCount === 2) {
                        clearTimeout(clickTimer);
                        clickCount = 0;
                        createPopup(video);
                    }
                });
                // Prevent default controls
                video.addEventListener('contextmenu', e => e.preventDefault());
                wrapper.appendChild(video);
                wrapper.appendChild(playButton);
                wrapper.appendChild(progressBar);
                el = wrapper;
            }
            if (el) grid.appendChild(el);
        });
        mediaGrid.innerHTML = '';
        mediaGrid.appendChild(headerRow);
        mediaGrid.appendChild(grid);
        // Add back button
        const backBtn = document.createElement('button');
        backBtn.textContent = '← Back to Sections';
        backBtn.className = 'event-section-btn';
        backBtn.style = 'margin:32px auto 24px auto;display:block;padding:12px 24px;border-radius:8px;background:var(--bg-tertiary);color:var(--accent-color);border:1px solid var(--accent-color);cursor:pointer;font-size:18px;';
        backBtn.onclick = () => {
            mediaGrid.style.display = 'none';
            mapContainer.style.display = 'block';
            document.querySelector('.info-panel').style.display = 'block';
            showEventListForCountry(country);
        };
        mediaGrid.appendChild(backBtn);
    } catch (err) {
        mediaGrid.innerHTML = '<div style="color:red;">Error loading media.</div>';
        console.error('[S3] Error loading media:', err);
    }
}

function getS3FolderName(country) {
    return countryS3FolderMap[country] || country.toLowerCase();
}

function updateCountryInfo(countryName) {
    const countryNameElement = document.getElementById('country-name');
    const countryInfo = document.getElementById('country-info');
    const eventListPanel = document.getElementById('event-list-panel');
    const bioSection = document.querySelector('.bio-section');
    
    if (countryName && visitedCountries.includes(countryName)) {
        countryInfo.querySelector('h2').textContent = countryName;
        countryNameElement.style.display = 'none';
        if (bioSection) bioSection.style.display = 'none';
        if (eventListPanel) eventListPanel.style.display = 'block';
        // Delay only the S3 fetch
        onS3Ready(() => showEventListForCountry(countryName));
    } else {
        countryInfo.querySelector('h2').textContent = 'About Me!';
        countryNameElement.style.display = 'none';
        if (bioSection) bioSection.style.display = 'block';
        if (eventListPanel) eventListPanel.style.display = 'none';
    }
}

async function updateViewCount() {
    try {
        const res = await fetch('/api/views', { method: 'POST' });
        const data = await res.json();
        document.getElementById('view-num').textContent = data.count;
    } catch (e) {
        document.getElementById('view-num').textContent = 'N/A';
    }
}

document.addEventListener('DOMContentLoaded', updateViewCount); 
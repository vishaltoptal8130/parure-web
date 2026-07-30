// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Marketplace Component & Luxury Showroom Detail Modal
// ─────────────────────────────────────────────────────────────────────

let currentListingsData = [];
let currentModalImages = [];
let currentModalImageIndex = 0;

export async function initMarketplaceModule(supabase) {
  setupMarketplaceEventListeners(supabase);
}

export async function renderMarketplaceTable(supabase) {
  const tbody = document.getElementById("marketplace-table-body");
  const filter = document.getElementById("filter-marketplace-status")?.value || "pending_review";
  const search = document.getElementById("search-marketplace")?.value.trim().toLowerCase() || "";

  if (!tbody) return;

  let query = supabase.from("marketplace_listings").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data: items, error } = await query;

  if (error || !items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 32px;">No ${filter.replace('_', ' ')} marketplace items found.</td></tr>`;
    return;
  }

  currentListingsData = items;

  // Filter client-side by search
  const filtered = items.filter(item => {
    if (!search) return true;
    const titleMatch = (item.name || item.title || item.description || "").toLowerCase().includes(search);
    const brandMatch = (item.brand || "").toLowerCase().includes(search);
    const categoryMatch = (item.category || "").toLowerCase().includes(search);
    const sellerMatch = (item.seller_display_name || item.seller_user_id || "").toLowerCase().includes(search);
    return titleMatch || brandMatch || categoryMatch || sellerMatch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 32px;">No items match search '${search}'.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((item) => {
    let imageUrl = (item.images && Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : (item.image_url || "");
    const priceUsd = ((item.price || 0) / 100).toFixed(2);
    const titleText = item.name || item.title || (item.description ? item.description.slice(0, 45) + '...' : 'Garment Listing');
    const brandText = item.brand || 'Unbranded';
    const conditionText = item.condition || 'N/A';
    const sizeText = item.size || item.size_value || 'N/A';

    // Contextual button logic
    let actionButtons = "";
    if (item.status === 'pending_review') {
      actionButtons = `
        <button class="btn-success" style="padding: 5px 10px; font-size: 11px;" onclick="updateListingStatusDirect('${item.id}', 'active')">Approve</button>
        <button class="btn-danger" style="padding: 5px 10px; font-size: 11px;" onclick="updateListingStatusDirect('${item.id}', 'declined')">Decline</button>
      `;
    } else if (item.status === 'active') {
      actionButtons = `
        <button class="btn-danger" style="padding: 5px 10px; font-size: 11px;" onclick="updateListingStatusDirect('${item.id}', 'removed')">Remove Listing</button>
      `;
    } else {
      actionButtons = `
        <button class="btn-secondary" style="padding: 5px 10px; font-size: 11px;" onclick="updateListingStatusDirect('${item.id}', 'active')">Re-Approve</button>
      `;
    }

    return `
      <tr id="row-listing-${item.id}">
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-tan); background: #000; display: flex; align-items: center; justify-content: center;">
              ${imageUrl ? `
                <img src="${imageUrl}" alt="Garment" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span style="display: none; font-size: 9px; color: var(--muted);">No Img</span>
              ` : `
                <span style="font-size: 9px; color: var(--muted);">No Img</span>
              `}
            </div>
            <div>
              <strong style="color: var(--cream); font-weight: 500; font-size: 13px;">${titleText}</strong><br>
              <span style="font-size: 11px; color: var(--tan);">${brandText}</span>
            </div>
          </div>
        </td>
        <td>
          <strong style="color: var(--tan-light); font-size: 14px;">$${priceUsd}</strong><br>
          <span style="font-size: 10px; color: var(--muted);">${item.category || 'General'}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--cream);">${conditionText}</span><br>
          <span style="font-size: 10px; color: var(--muted);">Size: ${sizeText}</span>
        </td>
        <td>
          <span class="status-badge ${item.authenticity_confirmed ? 'badge-approved' : 'badge-pending'}" style="font-size: 9px;">
            ${item.authenticity_confirmed ? 'VERIFIED' : 'UNCONFIRMED'}
          </span>
        </td>
        <td>
          <span class="status-badge badge-${item.status}">${(item.status || 'pending').toUpperCase()}</span>
        </td>
        <td>
          <span style="font-size: 11px; color: var(--muted-light);">${new Date(item.created_at).toLocaleDateString()}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <!-- EYE ICON FOR FULL MODAL VIEW -->
            <button class="btn-secondary btn-view-modal" data-id="${item.id}" title="View Complete Details" style="padding: 6px 9px;">
              <svg class="icon-svg" viewBox="0 0 24 24" style="width: 15px; height: 15px;">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </button>
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Attach modal trigger click handlers
  document.querySelectorAll(".btn-view-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      openListingDetailModal(id);
    });
  });
}

function debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function setupMarketplaceEventListeners(supabase) {
  document.getElementById("filter-marketplace-status")?.addEventListener("change", () => renderMarketplaceTable(supabase));
  document.getElementById("search-marketplace")?.addEventListener("input", debounce(() => renderMarketplaceTable(supabase), 300));
  document.getElementById("btn-close-marketplace-modal")?.addEventListener("click", closeListingDetailModal);

  // Close modal when clicking backdrop
  document.getElementById("modal-marketplace-detail")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-marketplace-detail") {
      closeListingDetailModal();
    }
  });

  // Close lightbox modal on backdrop click
  document.getElementById("lightbox-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "lightbox-modal") {
      document.getElementById("lightbox-modal").classList.remove("active");
    }
  });
}

export function openListingDetailModal(id) {
  const item = currentListingsData.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById("modal-marketplace-detail");
  if (!modal) return;

  // 1. Title & Brand
  document.getElementById("modal-item-title").innerText = item.name || item.title || "Garment Details";
  document.getElementById("modal-item-brand").innerText = item.brand ? item.brand.toUpperCase() : "UNBRANDED";
  
  // 2. Seller Info
  document.getElementById("modal-item-seller").innerText = item.seller_display_name || "Anonymous Seller";
  document.getElementById("modal-item-seller-id").innerText = item.seller_user_id ? `(${item.seller_user_id.slice(0, 8)}...)` : "(N/A)";

  // 3. Price & Financial Split
  const totalCents = item.price || 0;
  const priceUsd = (totalCents / 100).toFixed(2);
  const platformFeeCents = Math.round(totalCents * 0.10);
  const sellerNetCents = totalCents - platformFeeCents;
  document.getElementById("modal-item-price").innerText = `$${priceUsd}`;
  document.getElementById("modal-item-fee").innerText = `$${(platformFeeCents / 100).toFixed(2)}`;
  document.getElementById("modal-item-net").innerText = `$${(sellerNetCents / 100).toFixed(2)}`;

  // 4. Specs Grid
  document.getElementById("modal-item-category").innerText = item.category || "Tops";
  document.getElementById("modal-item-subcategory").innerText = item.subcategory || "N/A";
  document.getElementById("modal-item-size").innerText = item.size || "Standard";
  document.getElementById("modal-item-condition").innerText = item.condition || "Like new";
  document.getElementById("modal-item-gender").innerText = item.gender || "Unisex";
  document.getElementById("modal-item-season").innerText = item.season_tag || "All season";
  document.getElementById("modal-item-auth-status-field").innerText = item.auth_status || "pending";
  document.getElementById("modal-item-created-at").innerText = item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "N/A";
  document.getElementById("modal-item-auth-confirmed-at").innerText = item.authenticity_confirmed_at ? new Date(item.authenticity_confirmed_at).toLocaleString() : "Not confirmed yet";

  // 5. Color Swatch Tag
  const hexColor = item.dominant_color_hex || "#1A1A18";
  const colorName = item.color_name || "Standard Tint";
  const colorBox = document.getElementById("modal-item-color-swatch");
  if (colorBox) {
    colorBox.style.backgroundColor = hexColor;
    document.getElementById("modal-item-color-name").innerText = colorName;
    document.getElementById("modal-item-color-hex-tag").innerText = hexColor.toUpperCase();
  }

  // 6. Description
  document.getElementById("modal-item-description").innerText = item.description || "No description provided for this garment.";

  // 7. Badges
  const authBadge = document.getElementById("modal-item-auth-badge");
  if (authBadge) {
    authBadge.innerText = item.authenticity_confirmed ? "AUTHENTICITY CONFIRMED" : "UNVERIFIED";
    authBadge.className = `status-badge ${item.authenticity_confirmed ? 'badge-approved' : 'badge-pending'}`;
  }

  const statusBadge = document.getElementById("modal-item-status-badge");
  if (statusBadge) {
    statusBadge.innerText = (item.status || "pending").toUpperCase();
    statusBadge.className = `status-badge badge-${item.status}`;
  }

  // 8. Carousel State Initialization (UNCROPPED FULL DRESS CONTAIN)
  currentModalImages = (item.images && Array.isArray(item.images) && item.images.length > 0)
    ? item.images
    : ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80"];

  currentModalImageIndex = 0;
  updateModalCarouselView();

  // 9. Contextual Action Buttons with Real-Time Modal State Toggle
  const actionBox = document.getElementById("modal-action-buttons-container");
  const btnToggleAuth = document.getElementById("modal-btn-toggle-auth");

  if (btnToggleAuth) {
    btnToggleAuth.innerText = item.authenticity_confirmed ? "Unverify Authenticity" : "Confirm Authenticity";
    btnToggleAuth.onclick = async () => {
      const newState = !item.authenticity_confirmed;
      btnToggleAuth.innerText = "Updating...";
      btnToggleAuth.disabled = true;

      await window.toggleAuthenticityDirect(item.id, newState);
      item.authenticity_confirmed = newState;
      item.authenticity_confirmed_at = newState ? new Date().toISOString() : null;
      item.auth_status = newState ? 'verified' : 'pending';

      // Update Modal Header & Specs Grid live
      if (authBadge) {
        authBadge.innerText = newState ? "AUTHENTICITY CONFIRMED" : "UNVERIFIED";
        authBadge.className = `status-badge ${newState ? 'badge-approved' : 'badge-pending'}`;
      }
      document.getElementById("modal-item-auth-confirmed-at").innerText = newState ? new Date().toLocaleString() : "Not confirmed yet";
      document.getElementById("modal-item-auth-status-field").innerText = newState ? 'verified' : 'pending';

      btnToggleAuth.innerText = newState ? "Unverify Authenticity" : "Confirm Authenticity";
      btnToggleAuth.disabled = false;
    };
  }

  if (actionBox) {
    if (item.status === 'active') {
      actionBox.innerHTML = `
        <button type="button" class="btn-danger" style="padding: 10px 22px; font-size: 12px;" onclick="handleModalAction('${item.id}', 'removed')">Remove Listing</button>
      `;
    } else if (item.status === 'pending_review') {
      actionBox.innerHTML = `
        <button type="button" class="btn-danger" style="padding: 10px 20px; font-size: 12px;" onclick="handleModalAction('${item.id}', 'declined')">Decline Listing</button>
        <button type="button" class="btn-success" style="padding: 10px 22px; font-size: 12px;" onclick="handleModalAction('${item.id}', 'active')">Approve & Publish Item</button>
      `;
    } else {
      actionBox.innerHTML = `
        <button type="button" class="btn-success" style="padding: 10px 22px; font-size: 12px;" onclick="handleModalAction('${item.id}', 'active')">Re-Approve Listing</button>
      `;
    }
  }

  modal.classList.add("active");
}

function updateModalCarouselView() {
  const mainImage = document.getElementById("modal-main-image");
  const imgCountLabel = document.getElementById("modal-image-count");
  const prevBtn = document.getElementById("modal-carousel-prev");
  const nextBtn = document.getElementById("modal-carousel-next");
  const total = currentModalImages.length;

  if (mainImage) mainImage.src = currentModalImages[currentModalImageIndex];
  if (imgCountLabel) imgCountLabel.innerText = `${currentModalImageIndex + 1} / ${total}`;

  // Hide or show arrows depending on image count
  if (prevBtn && nextBtn) {
    if (total > 1) {
      prevBtn.style.display = "flex";
      nextBtn.style.display = "flex";
    } else {
      prevBtn.style.display = "none";
      nextBtn.style.display = "none";
    }
  }

  // Render thumbnails
  const imgGallery = document.getElementById("modal-image-gallery");
  if (imgGallery) {
    imgGallery.innerHTML = currentModalImages.map((url, idx) => `
      <img src="${url}" class="modal-thumb ${idx === currentModalImageIndex ? 'active' : ''}" 
           onclick="window.selectModalImageIndex(${idx})" 
           style="width: 64px; height: 64px; border-radius: 6px; object-fit: cover; cursor: pointer; border: 2px solid ${idx === currentModalImageIndex ? 'var(--tan)' : 'rgba(255,255,255,0.15)'}; background: #000; transition: border-color 0.2s;">
    `).join("");
  }
}

window.openFullImageLight = function() {
  const lightModal = document.getElementById("lightbox-modal");
  const lightImg = document.getElementById("lightbox-full-image");
  if (lightModal && lightImg && currentModalImages[currentModalImageIndex]) {
    lightImg.src = currentModalImages[currentModalImageIndex];
    lightModal.classList.add("active");
  }
};

window.selectModalImageIndex = function(idx) {
  currentModalImageIndex = idx;
  updateModalCarouselView();
};

window.prevModalImage = function() {
  if (currentModalImages.length <= 1) return;
  currentModalImageIndex = (currentModalImageIndex - 1 + currentModalImages.length) % currentModalImages.length;
  updateModalCarouselView();
};

window.nextModalImage = function() {
  if (currentModalImages.length <= 1) return;
  currentModalImageIndex = (currentModalImageIndex + 1) % currentModalImages.length;
  updateModalCarouselView();
};

window.handleModalAction = async function(id, status) {
  await window.updateListingStatusDirect(id, status);
  closeListingDetailModal();
};

window.switchModalMainImage = function(url, thumbEl) {
  const idx = currentModalImages.indexOf(url);
  if (idx !== -1) {
    window.selectModalImageIndex(idx);
  }
};

export function closeListingDetailModal() {
  const modal = document.getElementById("modal-marketplace-detail");
  if (modal) modal.classList.remove("active");
}

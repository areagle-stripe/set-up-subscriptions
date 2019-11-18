var stripe;
var setupIntentSecret;
var form = document.getElementById("payment-form");

var stripeElements = function(publicKey) {
  stripe = Stripe(publicKey, { betas: ["au_bank_account_beta_2"] });
  var elements = stripe.elements();

  // Card Element styles
  var style = {
    base: {
      fontSize: "16px",
      color: "#32325d",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      fontSmoothing: "antialiased",
      "::placeholder": {
        color: "rgba(0,0,0,0.4)"
      }
    }
  };

  var card = elements.create("card", { style: style });

  card.mount("#card-element");

  // AU BECS Debit Element
  var auBankAccount = elements.create("auBankAccount", {
    style: style
  });

  // Add an instance of the auBankAccount Element into the `auBankAccount-element` <div>.
  auBankAccount.mount("#auBankAccount-element");

  for (element of [card, auBankAccount]) {
    // Element focus ring
    element.on("focus", function() {
      var el = document.getElementById(`${element._componentName}-element`);
      el.classList.add("focused");
    });

    element.on("blur", function() {
      var el = document.getElementById(`${element._componentName}-element`);
      el.classList.remove("focused");
    });

    element.on("change", function(event) {
      var displayError = document.getElementById("error-message");
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = "";
      }
    });
  }

  form.addEventListener("submit", function(evt) {
    evt.preventDefault();
    changeLoadingState(true);
    // Initiate payment
    var payment = form.querySelector("input[name=payment]:checked").value;
    createPaymentMethodAndCustomer(stripe, payment, {
      card: card,
      au_becs_debit: auBankAccount
    });
  });
};

function showCardError(error) {
  changeLoadingState(false);
  // The card was declined (i.e. insufficient funds, card has expired, etc)
  var errorMsg = document.querySelector(".sr-field-error");
  errorMsg.textContent = error.message;
  setTimeout(function() {
    errorMsg.textContent = "";
  }, 8000);
}

var createPaymentMethodAndCustomer = function(stripe, paymentMethod, element) {
  var billingName = document.querySelector("#name").value;
  var billingEmail = document.querySelector("#email").value;

  switch (paymentMethod) {
    case "card":
      stripe
        .confirmCardSetup(setupIntentSecret, {
          payment_method: {
            card: element[paymentMethod],
            billing_details: {
              name: billingName,
              email: billingEmail
            }
          }
        })
        .then(handleResult);
      break;
    case "au_becs_debit":
      stripe
        .confirmAuBecsDebitSetup(setupIntentSecret, {
          payment_method: {
            au_becs_debit: element[paymentMethod],
            billing_details: {
              name: billingName,
              email: billingEmail
            }
          }
        })
        .then(handleResult);
      break;
    default:
      console.warn("Unhandled Payment Method!");
      break;
  }

  function handleResult(result) {
    if (result.error) {
      showCardError(result.error);
    } else {
      createCustomer(result.setupIntent.payment_method, billingEmail);
    }
  }
};

async function createCustomer(paymentMethod, billingEmail) {
  return fetch("/create-customer", {
    method: "post",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: billingEmail,
      payment_method: paymentMethod
    })
  })
    .then(response => {
      return response.json();
    })
    .then(subscription => {
      handleSubscription(subscription);
    });
}

function handleSubscription(subscription) {
  const { latest_invoice } = subscription;
  const { payment_intent } = latest_invoice;

  if (payment_intent) {
    const { client_secret, status } = payment_intent;

    if (status === "requires_action" || status === "requires_payment_method") {
      stripe.confirmCardPayment(client_secret).then(function(result) {
        if (result.error) {
          // Display error message in your UI.
          // The card was declined (i.e. insufficient funds, card has expired, etc)
          changeLoadingState(false);
          showCardError(result.error);
        } else {
          // Show a success message to your customer
          confirmSubscription(subscription.id);
        }
      });
    } else {
      // No additional information was needed
      // Show a success message to your customer
      orderComplete(subscription);
    }
  } else {
    orderComplete(subscription);
  }
}

function confirmSubscription(subscriptionId) {
  return fetch("/subscription", {
    method: "post",
    headers: {
      "Content-type": "application/json"
    },
    body: JSON.stringify({
      subscriptionId: subscriptionId
    })
  })
    .then(function(response) {
      return response.json();
    })
    .then(function(subscription) {
      orderComplete(subscription);
    });
}

function getPublicKey() {
  return fetch("/public-key", {
    method: "get",
    headers: {
      "Content-Type": "application/json"
    }
  })
    .then(function(response) {
      return response.json();
    })
    .then(function(response) {
      setupIntentSecret = response.setupIntentSecret;
      stripeElements(response.publicKey);
    });
}

getPublicKey();

/* ------- Post-payment helpers ------- */

/* Shows a success / error message when the payment is complete */
var orderComplete = function(subscription) {
  changeLoadingState(false);
  var subscriptionJson = JSON.stringify(subscription, null, 2);
  document.querySelectorAll(".payment-view").forEach(function(view) {
    view.classList.add("hidden");
  });
  document.querySelectorAll(".completed-view").forEach(function(view) {
    view.classList.remove("hidden");
  });
  document.querySelector(".order-status").textContent = subscription.status;
  document.querySelector("code").textContent = subscriptionJson;
};

// Show a spinner on subscription submission
var changeLoadingState = function(isLoading) {
  if (isLoading) {
    document.querySelector("#spinner").classList.add("loading");
    document.querySelector("button").disabled = true;

    document.querySelector("#button-text").classList.add("hidden");
  } else {
    document.querySelector("button").disabled = false;
    document.querySelector("#spinner").classList.remove("loading");
    document.querySelector("#button-text").classList.remove("hidden");
  }
};

var showPaymentMethods = function() {
  // Listen to changes to the payment method selector.
  for (let input of document.querySelectorAll("input[name=payment]")) {
    input.addEventListener("change", event => {
      event.preventDefault();
      var payment = form.querySelector("input[name=payment]:checked").value;

      // Show the relevant details, whether it's an extra element or extra information for the user.
      form
        .querySelector(".payment-info.card")
        .classList.toggle("visible", payment === "card");
      form
        .querySelector(".payment-info.au_becs_debit")
        .classList.toggle("visible", payment === "au_becs_debit");
    });
  }
};
showPaymentMethods();

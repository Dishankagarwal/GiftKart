import { useEffect, useState } from "react";

const screens = [
  ["landing", "Landing page"],
  ["login", "Couple sign in"],
  ["create-account", "Couple registration"],
  ["create-registry", "Create registry"],
  ["dashboard", "Couple dashboard"],
  ["edit-gift", "Add / edit gift"],
  ["public-registry", "Public wishlist"],
  ["reserve-gift", "Reserve a gift"],
  ["contribute", "Group contribution"],
  ["guest-status", "Guest status"],
  ["management", "Gift management"],
] as const;

type Screen = (typeof screens)[number][0];

const gifts = [
  {
    category: "For our home",
    emoji: "🪑",
    name: "A little reading nook",
    description: "A cozy chair for slow mornings and long conversations.",
    price: 18500,
    kind: "Individual gift",
  },
  {
    category: "For our home",
    emoji: "🍽️",
    name: "Dinnerware for two",
    description: "The plates we'll reach for on ordinary, lovely evenings.",
    price: 7200,
    kind: "Individual gift",
  },
  {
    category: "Our next adventure",
    emoji: "🏝️",
    name: "A weekend by the sea",
    description: "Help us make a few first memories somewhere new.",
    price: 40000,
    kind: "Group gift",
  },
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

function getScreen(): Screen {
  const screen = window.location.hash.slice(1) as Screen;
  return screens.some(([key]) => key === screen) ? screen : "landing";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getScreen);

  useEffect(() => {
    const syncScreen = () => setScreen(getScreen());
    window.addEventListener("hashchange", syncScreen);
    return () => window.removeEventListener("hashchange", syncScreen);
  }, []);

  const navigate = (nextScreen: Screen) => {
    window.location.hash = nextScreen;
    setScreen(nextScreen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <div className="prototype-notice">
        <span className="notice-dot" />
        Product preview · Demo only — changes are not saved
      </div>
      <header className="site-header">
        <a
          className="brand"
          href="#landing"
          onClick={() => navigate("landing")}
          aria-label="ShaadiLedger home"
        >
          <span className="brand-mark">s</span>
          <span>shaadi<span className="brand-light">ledger</span></span>
        </a>
        <nav className="header-actions" aria-label="Main navigation">
          <a href="#public-registry" onClick={() => navigate("public-registry")}>
            Find a registry
          </a>
          <button className="button button-dark button-small" onClick={() => navigate("login")}>
            Couple sign in <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </header>

      <main>
        {screen === "landing" && <Landing navigate={navigate} />}
        {screen === "login" && <Login key={screen} navigate={navigate} />}
        {screen === "create-account" && <Login key={screen} navigate={navigate} initialCreatingAccount />}
        {screen === "create-registry" && <CreateRegistry navigate={navigate} />}
        {screen === "dashboard" && <Dashboard navigate={navigate} />}
        {screen === "edit-gift" && <EditGift navigate={navigate} />}
        {screen === "public-registry" && <PublicRegistry navigate={navigate} />}
        {screen === "reserve-gift" && <ReserveGift navigate={navigate} />}
        {screen === "contribute" && <Contribute navigate={navigate} />}
        {screen === "guest-status" && <GuestStatus navigate={navigate} />}
        {screen === "management" && <Management navigate={navigate} />}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <a className="brand footer-brand" href="#landing" onClick={() => navigate("landing")}>
            <span className="brand-mark">s</span>
            <span>shaadi<span className="brand-light">ledger</span></span>
          </a>
          <p>Made for the beginning of everything.</p>
        </div>
        <details className="prototype-menu">
          <summary>Explore prototype screens</summary>
          <div className="prototype-links">
            {screens.map(([key, title]) => (
              <button key={key} onClick={() => navigate(key)}>{title}</button>
            ))}
          </div>
        </details>
        <div className="footer-bottom">
          <span>© 2026 ShaadiLedger</span>
          <span>Private celebrations, thoughtfully shared.</span>
        </div>
      </footer>
    </div>
  );
}

type Navigate = (screen: Screen) => void;

function Eyebrow({ children }: { children: string }) {
  return <p className="eyebrow">{children}</p>;
}

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function Landing({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <Eyebrow>A more meaningful way to celebrate</Eyebrow>
          <h1>Gifts that feel<br />like <em>you.</em></h1>
          <p className="hero-description">
            A thoughtful place to gather the things you love, and make it easy
            for the people you love to be part of it.
          </p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={() => navigate("create-account")}>
              Create your registry <span aria-hidden="true">↗</span>
            </button>
            <button className="text-button" onClick={() => navigate("public-registry")}>
              Explore a sample <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="hero-note">
            <span className="avatar-stack" aria-hidden="true"><i>A</i><i>P</i></span>
            <span>Made for two. Shared with everyone.</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Wedding flowers and a sample registry card">
          <div className="art-sun" />
          <div className="art-flower flower-one">✿</div>
          <div className="art-flower flower-two">✿</div>
          <div className="art-leaf leaf-one">⌁</div>
          <div className="art-leaf leaf-two">⌁</div>
          <div className="hero-card">
            <div className="hero-card-top"><span>OUR WEDDING</span><span>✳</span></div>
            <p className="script-name">Aarav <span>&</span> Priya</p>
            <div className="card-divider" />
            <p className="hero-card-date">14 February 2027 · Jaipur</p>
            <div className="mini-gift">
              <span className="mini-gift-image">🪑</span>
              <span><b>A little reading nook</b><small>For our first home together</small></span>
              <span className="mini-heart">♡</span>
            </div>
          </div>
          <span className="art-caption">a collection of little wishes</span>
        </div>
      </section>

      <section className="intro-band">
        <div className="section-wrap intro-grid">
          <span className="intro-mark">✳</span>
          <p>Your people want to celebrate you.<br /><em>Let them do it your way.</em></p>
          <span className="intro-aside">A registry, with a little more heart.</span>
        </div>
      </section>

      <section className="section-wrap how-section">
        <div className="section-heading">
          <div><Eyebrow>Simple, from the first click</Eyebrow><h2>Thoughtful gifting.<br /><em>Made effortless.</em></h2></div>
          <p>One link brings your people a little closer to the things you're dreaming up together.</p>
        </div>
        <div className="steps-grid">
          <Step number="01" title="Make it yours" description="Create your wedding page and add the gifts, ideas, and experiences that feel like you." icon="✎" />
          <Step number="02" title="Share the love" description="Send one private link to the people you love. No app, account, or fuss for guests." icon="↗" />
          <Step number="03" title="Feel the love" description="Guests choose a gift or join a group gift, then pay you directly, offline." icon="♡" />
        </div>
      </section>

      <section className="registry-cta">
        <div className="section-wrap cta-inner">
          <div><Eyebrow>Your beginning, your way</Eyebrow><h2>A little more joy<br />in every <em>“I do.”</em></h2></div>
          <button className="button button-light" onClick={() => navigate("create-account")}>
            Start your registry <span aria-hidden="true">↗</span>
          </button>
          <span className="cta-flower" aria-hidden="true">✿</span>
        </div>
      </section>

      <section className="section-wrap screen-hint">
        <p>You're viewing the first visual prototype.</p>
        <button className="text-button" onClick={() => navigate("public-registry")}>See the guest wishlist <span aria-hidden="true">→</span></button>
      </section>
    </>
  );
}

function Step({ number, title, description, icon }: { number: string; title: string; description: string; icon: string }) {
  return (
    <article className="step-card">
      <div className="step-card-top"><span>{number}</span><span className="step-icon">{icon}</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function Login({
  navigate,
  initialCreatingAccount = false,
}: {
  navigate: Navigate;
  initialCreatingAccount?: boolean;
}) {
  const [creatingAccount, setCreatingAccount] = useState(initialCreatingAccount);

  return (
    <section className="form-page section-wrap">
      <div className="form-card">
        <PageIntro
          eyebrow={creatingAccount ? "A lovely beginning" : "Welcome back"}
          title={creatingAccount ? "Create your account." : "Your registry awaits."}
          description={creatingAccount ? "Start with an account, then make your wedding page." : "Sign in to make a little magic for your celebration."}
        />
        <form onSubmit={(event) => event.preventDefault()}>
          <label>Email address<input type="email" placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" placeholder={creatingAccount ? "Create a password" : "Enter your password"} autoComplete={creatingAccount ? "new-password" : "current-password"} /></label>
          <button
            className="button button-dark button-wide"
            type="button"
            onClick={() => creatingAccount && navigate("create-registry")}
          >
            {creatingAccount ? "Continue to registry details" : "Sign in"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-footnote">
          {creatingAccount ? "Already have an account?" : "New to ShaadiLedger?"}{" "}
          <button onClick={() => setCreatingAccount(!creatingAccount)}>
            {creatingAccount ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="prototype-help">Account creation and sign-in are visual prototypes, not connected to an account service.</p>
      </div>
    </section>
  );
}

function CreateRegistry({ navigate }: { navigate: Navigate }) {
  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="A lovely beginning" title="Let's make it yours." description="Start with the details your guests will see." />
        <form onSubmit={(event) => event.preventDefault()}>
          <div className="field-row">
            <label>Your name<input placeholder="e.g. Aarav" autoComplete="given-name" /></label>
            <label>Your partner's name<input placeholder="e.g. Priya" /></label>
          </div>
          <div className="field-row">
            <label>Wedding date<input type="date" /></label>
            <label>City<input placeholder="e.g. Jaipur" /></label>
          </div>
          <label>A welcome note <span className="optional">(optional)</span><textarea rows={3} placeholder="A little note to the people celebrating with you..." /></label>
          <button className="button button-dark button-wide" type="button" onClick={() => navigate("dashboard")}>Preview your dashboard <span aria-hidden="true">↗</span></button>
        </form>
        <p className="prototype-help">This preview does not create or save a registry.</p>
      </div>
    </section>
  );
}

function Dashboard({ navigate }: { navigate: Navigate }) {
  return (
    <section className="dashboard-page section-wrap">
      <div className="dashboard-top">
        <div><Eyebrow>YOUR WEDDING REGISTRY</Eyebrow><h1>Aarav <em>&</em> Priya</h1><p className="muted">14 February 2027 <span>·</span> Jaipur</p></div>
        <button className="button button-dark" onClick={() => navigate("public-registry")}>Preview registry <span aria-hidden="true">↗</span></button>
      </div>
      <div className="dashboard-stats">
        <Stat value="08" label="Gifts on your list" />
        <Stat value="03" label="Gifts reserved" />
        <Stat value="₹18,000" label="Group gifts verified" />
      </div>
      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>YOUR WISHLIST</Eyebrow><h2>A few lovely things</h2></div><button className="text-button" onClick={() => navigate("edit-gift")}>Add a gift +</button></div>
          {gifts.map((gift) => <GiftRow key={gift.name} gift={gift} />)}
        </article>
        <aside className="panel share-panel">
          <Eyebrow>YOUR PRIVATE LINK</Eyebrow><h2>Ready to share?</h2>
          <p>Your guests can browse, choose a gift, and pay you directly.</p>
          <div className="share-link">shaadiledger.com/w/aarav-priya <span>↗</span></div>
          <button className="button button-outline button-wide">Copy link</button>
          <div className="member-note"><span className="member-avatar">A</span><span><b>Registry owner</b><small>Invite your partner as a collaborator</small></span><button aria-label="Invite partner">+</button></div>
        </aside>
      </div>
      <p className="prototype-help">Dashboard values are sample data. Authentication and saved changes are not connected.</p>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function GiftRow({ gift }: { gift: (typeof gifts)[number] }) {
  return <div className="gift-row"><span className="gift-thumb">{gift.emoji}</span><span className="gift-row-copy"><b>{gift.name}</b><small>{gift.kind}</small></span><span className="gift-row-price">{money(gift.price)}</span></div>;
}

function EditGift({ navigate }: { navigate: Navigate }) {
  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="Your wishlist" title="Add a little wish." description="Choose a gift type and tell your guests why it matters to you." />
        <form onSubmit={(event) => event.preventDefault()}>
          <label>Gift name<input placeholder="e.g. A little reading nook" /></label>
          <label>What makes it special? <span className="optional">(optional)</span><textarea rows={3} placeholder="Add a note for your guests..." /></label>
          <div className="field-row">
            <label>Gift type<select defaultValue="individual"><option value="individual">Individual gift</option><option value="group">Group gift</option></select></label>
            <label>{/* Target is the total gift value for either type. */}Price or group target<input type="number" min="1" placeholder="e.g. 18500" /></label>
          </div>
          <div className="field-row">
            <label>Category<select defaultValue=""><option value="" disabled>Choose a category</option><option>For our home</option><option>Our next adventure</option><option>Something meaningful</option></select></label>
            <label>Gift link <span className="optional">(optional)</span><input type="url" placeholder="https://" /></label>
          </div>
          <button className="button button-dark button-wide" type="button" onClick={() => navigate("dashboard")}>Back to dashboard <span aria-hidden="true">↗</span></button>
        </form>
        <p className="prototype-help">Gift details in this prototype are not saved.</p>
      </div>
    </section>
  );
}

function PublicRegistry({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="registry-cover">
        <div className="registry-cover-flower">✿</div>
        <Eyebrow>WITH FULL HEARTS, WE INVITE YOU</Eyebrow>
        <h1>Aarav <em>&</em> Priya</h1>
        <p>14 February 2027 <span>·</span> Jaipur</p>
        <span className="cover-rule" />
        <p className="cover-note">Your love is the best gift. If you'd like to give us something more, we've gathered a few things that feel like home.</p>
      </section>
      <section className="section-wrap wishlist-section">
        <div className="section-heading wishlist-heading">
          <div><Eyebrow>A FEW THINGS WE'RE DREAMING OF</Eyebrow><h2>Our little <em>wishlist.</em></h2></div>
          <p>Choose something that feels right. For shared gifts, every little bit brings us closer.</p>
        </div>
        <div className="gift-grid">
          {gifts.map((gift, index) => (
            <article className="wishlist-card" key={gift.name}>
              <div className={`wishlist-image wishlist-image-${index + 1}`}><span>{gift.emoji}</span><span className="gift-type">{gift.kind}</span></div>
              <div className="wishlist-card-body">
                <Eyebrow>{gift.category}</Eyebrow>
                <h3>{gift.name}</h3><p>{gift.description}</p>
                {gift.kind === "Group gift" ? (
                  <div className="progress-area"><div className="progress-label"><span>₹18,000 gifted</span><span>of {money(gift.price)}</span></div><div className="progress-track"><span style={{ width: "45%" }} /></div></div>
                ) : <p className="gift-price">{money(gift.price)}</p>}
                <button className="text-button card-link" onClick={() => navigate(gift.kind === "Group gift" ? "contribute" : "reserve-gift")}>
                  {gift.kind === "Group gift" ? "Contribute to this gift" : "Choose this gift"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        <p className="registry-thanks">Thank you for being part of our story. <span>♡</span></p>
      </section>
    </>
  );
}

function ReserveGift({ navigate }: { navigate: Navigate }) {
  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="Aarav & Priya · 14 February 2027" title="A thoughtful choice." description="You're choosing “A little reading nook”. Share your name so the couple knows who it's from." />
        <div className="selected-gift"><span>🪑</span><div><b>A little reading nook</b><small>For our home · {money(18500)}</small></div></div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>Your name<input placeholder="Name the couple will recognize" autoComplete="name" /></label>
          <label>Email or phone number<input placeholder="One contact method" autoComplete="email" /></label>
          <button className="button button-dark button-wide" type="button" onClick={() => navigate("guest-status")}>Preview reservation confirmation <span aria-hidden="true">↗</span></button>
        </form>
        <p className="form-footnote">The couple will see your name and contact details. You can cancel your reservation later using your private link.</p>
        <p className="prototype-help">This preview does not reserve the gift.</p>
      </div>
    </section>
  );
}

function Contribute({ navigate }: { navigate: Navigate }) {
  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="Aarav & Priya · Group gift" title="A little, together." description="Contribute any amount toward their weekend by the sea. The total gift target is ₹40,000." />
        <div className="contribution-progress"><div className="progress-label"><span>₹18,000 contributed</span><span>₹22,000 left</span></div><div className="progress-track"><span style={{ width: "45%" }} /></div></div>
        <form onSubmit={(event) => event.preventDefault()}>
          <div className="field-row">
            <label>Your contribution amount<input type="number" min="1" placeholder="e.g. 2,000" /></label>
            <label>Your name<input placeholder="Name the couple will recognize" /></label>
          </div>
          <label>Email or phone number<input placeholder="One contact method" autoComplete="email" /></label>
          <div className="payment-instructions"><Eyebrow>PAY THE COUPLE DIRECTLY</Eyebrow><p>After pledging, use the couple's UPI, bank transfer, or cash instructions. ShaadiLedger does not collect or process payment.</p><span>UPI details are shown in the couple's published instructions.</span></div>
          <button className="button button-dark button-wide" type="button" onClick={() => navigate("guest-status")}>Preview pledge and payment steps <span aria-hidden="true">↗</span></button>
        </form>
        <p className="prototype-help">This preview does not create a pledge or report a payment.</p>
      </div>
    </section>
  );
}

function GuestStatus({ navigate }: { navigate: Navigate }) {
  return (
    <section className="form-page section-wrap">
      <div className="form-card status-card">
        <span className="status-icon">♡</span>
        <Eyebrow>YOUR PRIVATE GUEST LINK</Eyebrow>
        <h1>Your gift, with love.</h1>
        <p className="status-description">This private page shows the current status for the gift you chose.</p>
        <div className="status-summary">
          <span>Gift</span><b>A little reading nook</b>
          <span>Reservation</span><b className="status-pill">Reserved</b>
          <span>Group contribution</span><b>₹2,000 · Payment reported</b>
        </div>
        <p className="form-footnote">Aarav & Priya can see your reservation and will update a reported payment after checking their account. Keep this private link somewhere safe.</p>
        <button className="button button-outline button-wide" onClick={() => navigate("public-registry")}>Back to their registry</button>
        <p className="prototype-help">Example reservation and contribution statuses only; this private-link flow is not connected.</p>
      </div>
    </section>
  );
}

function Management({ navigate }: { navigate: Navigate }) {
  return (
    <section className="dashboard-page section-wrap">
      <PageIntro eyebrow="REGISTRY MANAGEMENT" title="A little love, coming in." description="Reservations and payment reports are visible to verified registry members only." />
      <div className="dashboard-grid management-grid">
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>GIFT RESERVATIONS</Eyebrow><h2>Chosen with love</h2></div><span className="count-pill">3 reserved</span></div>
          <div className="management-row"><span className="gift-thumb">🪑</span><span className="gift-row-copy"><b>A little reading nook</b><small>Reserved by Rohan · 2 days ago</small></span><button className="button button-outline button-small">Release</button></div>
          <div className="management-row"><span className="gift-thumb">🍽️</span><span className="gift-row-copy"><b>Dinnerware for two</b><small>Reserved by Meera · Yesterday</small></span><button className="button button-outline button-small">Release</button></div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>PAYMENT REPORTED</Eyebrow><h2>Ready for a check-in</h2></div><span className="count-pill">2 to review</span></div>
          <div className="management-row"><span className="gift-thumb">🏝️</span><span className="gift-row-copy"><b>Ananya · ₹2,000</b><small>Weekend by the sea · Today</small></span><button className="text-button">Review →</button></div>
          <div className="management-row"><span className="gift-thumb">🏝️</span><span className="gift-row-copy"><b>Kabir · ₹5,000</b><small>Weekend by the sea · Yesterday</small></span><button className="text-button">Review →</button></div>
        </article>
      </div>
      <div className="notice-card"><span>✳</span><p>Verifying a report updates the collected total. If you reject it, the guest can report the payment again.</p></div>
      <button className="text-button" onClick={() => navigate("dashboard")}>← Back to dashboard</button>
      <p className="prototype-help">Management actions are not connected. Payment proof is not collected.</p>
    </section>
  );
}

export default App;

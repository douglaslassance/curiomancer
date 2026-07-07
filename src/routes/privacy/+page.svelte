<svelte:head>
	<title>Privacy · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-5xl">
	<h1 class="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
	<p class="text-muted-foreground mt-1 text-sm">Last updated July 2026</p>

	<div class="mt-6 space-y-4 text-sm leading-relaxed">
		<p>
			This policy explains what Curiomancer LLC ("Curiomancer", "we", "us") collects when you use
			the service, why we collect it, and what say you have over it. We collect what we need to
			match you with places and people who share your taste. We do not sell your personal
			information.
		</p>

		<h2 class="text-base font-semibold">Information we collect</h2>
		<ul class="list-disc space-y-2 pl-5">
			<li>
				<span class="font-medium">Account details.</span> Your name, email address, password (stored
				as a hash, not in plain text), and, if you add one, a profile photo.
			</li>
			<li>
				<span class="font-medium">Location.</span> If you grant permission, your device's coordinates,
				which we resolve to a city, country, and timezone. Location is optional, and you can update or
				clear it anytime from Settings.
			</li>
			<li>
				<span class="font-medium">Taste data.</span> The places you mark liked, disliked, seen, or want-to-go.
				This is what powers your recommendations and taste-twin matches.
			</li>
			<li>
				<span class="font-medium">Messages.</span> The content of messages and reactions you send to
				other users through Curiomancer. During this beta, message content is readable on our servers
				so we can operate and moderate the service. Once we're past beta, conversations will be
				end-to-end encrypted, so not even we will be able to read their content.
			</li>
			<li>
				<span class="font-medium">Usage and device data.</span> Basic technical data like IP address,
				browser/device type, and session activity, used to keep accounts secure and the service running.
			</li>
			<li>
				<span class="font-medium">Anything you send us directly.</span> Such as messages through our
				<a href="/contact" class="font-medium underline">contact form</a>.
			</li>
		</ul>

		<h2 class="text-base font-semibold">How we use it</h2>
		<p>
			We use this information to operate Curiomancer: matching you with places and taste-twins,
			showing you recommendations, delivering the messages you send, keeping the service secure,
			and responding when you contact us. We may also use aggregated, non-identifying usage
			patterns to understand how the product is used and improve it.
		</p>

		<h2 class="text-base font-semibold">How matching protects your data</h2>
		<p>
			We do not expose whose likes drove a recommendation. Matches are based on taste overlap, but
			we never show which person's affiliation with a place turned it into a recommendation for
			you, so you cannot work out and game your own likes to force a match with someone.
		</p>
		<p>
			Once you match with a taste-twin, you still do not get access to their full taste profile,
			only the aspects you share. This means you cannot use a match to reverse-engineer someone's
			full profile or artificially inflate your match score with them.
		</p>

		<h2 class="text-base font-semibold">Who we share it with</h2>
		<p>
			We do not sell your personal information. Other users can see what you choose to show them:
			your name, photo, and any ratings or messages you send. We also share limited data with
			service providers who help us run Curiomancer, each only getting what it needs to do its
			job:
		</p>
		<ul class="list-disc space-y-2 pl-5">
			<li>Apple MapKit, for map display and place search.</li>
			<li>OpenStreetMap and Open-Meteo, for resolving coordinates to a place and showing local weather.</li>
			<li>Cloudflare, for storing profile photos and delivering account and transactional emails.</li>
			<li>
				Analytics and error-tracking tools (such as PostHog and Sentry), when enabled, to understand
				usage and diagnose bugs.
			</li>
		</ul>
		<p>
			We do not currently process payments. If we introduce a paid plan, any billing information
			will be handled by a third-party payment processor, and we will update this policy before it
			launches.
		</p>

		<h2 class="text-base font-semibold">Cookies and sessions</h2>
		<p>
			We use a session cookie to keep you signed in. We don't use third-party advertising or
			tracking cookies.
		</p>

		<h2 class="text-base font-semibold">Data retention and your choices</h2>
		<p>
			We keep your data while your account is active. If you delete a message, its content is
			removed but the message row is kept so replies to it still make sense in the conversation.
			You can block anyone you don't want to interact with from Settings, which removes you from
			each other's twins, nearby, and messaging surfaces.
		</p>
		<p>
			We don't yet have a self-serve way to delete your account. To access, export, or delete your
			account and associated data, <a href="/contact" class="font-medium underline">contact us</a>
			and we'll take care of it.
		</p>

		<h2 class="text-base font-semibold">Children's privacy</h2>
		<p>
			Curiomancer is intended for people 18 and older. We don't knowingly collect information from
			anyone under 18, and we'll delete any such data if we become aware of it.
		</p>

		<h2 class="text-base font-semibold">Changes to this policy</h2>
		<p>
			This is a living document for an early-stage product. We'll update this page as the service
			changes and update the date at the top when we do.
		</p>

		<p>
			Questions or requests? <a href="/contact" class="font-medium underline">Contact us</a>.
		</p>
	</div>
</div>

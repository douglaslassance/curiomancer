<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
</script>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Create your account</Card.Title>
			<Card.Description>Start liking places to build your taste profile.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				class="space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					alert('Auth not wired yet — coming in the next slice.');
				}}
			>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" type="text" placeholder="Jane Doe" required />
				</div>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" placeholder="you@example.com" required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" type="password" required minlength={8} />
				</div>
				<Button type="submit" class="w-full">Create account</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">Already on Bond?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
